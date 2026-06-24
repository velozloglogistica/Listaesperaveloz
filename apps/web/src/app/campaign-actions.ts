"use server";

import { revalidatePath } from "next/cache";

import { requireTelegramCampaignAccess } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import {
  buildTelegramMessage,
  chunkArray,
  getWaitlistMatches,
  parseSpreadsheet,
  sanitizeDigits,
  normalizeCell,
  type ImportedRecipient,
  type WaitlistMatch,
} from "@/lib/telegram-campaigns";
import { TELEGRAM_GROUP_TARGETS } from "@/lib/telegram-group-targets";

export type CampaignActionState = {
  status: "idle" | "error" | "success";
  message: string;
  campaignId?: string;
};

type CampaignMode = "planilha" | "individual" | "grupo" | "grupo_telegram";

type InsertedRecipient = {
  id: string;
  cpf: string;
  nome: string;
  telefone: string | null;
  hotzone: string | null;
  turno: string | null;
  telegram_chat_id: number | null;
};

type PreparedCampaignMedia = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

const initialState: CampaignActionState = {
  status: "idle",
  message: "",
};

function parseCampaignMode(value: FormDataEntryValue | null): CampaignMode {
  if (value === "individual" || value === "grupo" || value === "planilha" || value === "grupo_telegram") {
    return value;
  }

  return "planilha";
}

function parseSelectedGroupIds(formData: FormData) {
  const rawJson = String(formData.get("selected_group_ids") || "").trim();

  if (!rawJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawJson);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .filter((value, index, allValues) => allValues.indexOf(value) === index);
  } catch {
    throw new Error("Nao foi possivel ler os grupos do Telegram selecionados.");
  }
}

async function parseCampaignMedia(formData: FormData) {
  const uploadedMedia = formData.get("imagem_campanha");

  if (!(uploadedMedia instanceof File) || uploadedMedia.size === 0) {
    return null;
  }

  if (!uploadedMedia.type.startsWith("image/")) {
    throw new Error("Anexe apenas imagem JPG, PNG ou WEBP na campanha.");
  }

  if (uploadedMedia.size > 9 * 1024 * 1024) {
    throw new Error("A imagem da campanha deve ter no maximo 9 MB.");
  }

  return {
    fileName: uploadedMedia.name || "campanha-imagem",
    contentType: uploadedMedia.type || "image/jpeg",
    buffer: Buffer.from(await uploadedMedia.arrayBuffer()),
  } satisfies PreparedCampaignMedia;
}

function parseButtonList(formData: FormData) {
  const useButtons = String(formData.get("usar_botoes") || "") === "true";

  if (!useButtons) {
    return [];
  }

  const rawJson = String(formData.get("buttons_json") || "").trim();
  const fallback = [String(formData.get("botao_1") || ""), String(formData.get("botao_2") || "")];
  let parsedButtons: unknown = fallback;

  if (rawJson) {
    try {
      parsedButtons = JSON.parse(rawJson);
    } catch {
      throw new Error("Nao foi possivel ler os botoes configurados.");
    }
  }

  if (!Array.isArray(parsedButtons)) {
    throw new Error("Os botoes da campanha sao invalidos.");
  }

  const buttons = parsedButtons
    .map((value) => normalizeCell(value))
    .filter(Boolean)
    .filter((value, index, allValues) => allValues.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);

  if (buttons.length < 2) {
    throw new Error("Adicione pelo menos dois botoes para a campanha.");
  }

  if (buttons.length > 6) {
    throw new Error("Use no maximo seis botoes por campanha.");
  }

  return buttons;
}

function parseSelectedWaitlistIds(formData: FormData) {
  const rawJson = String(formData.get("selected_waitlist_ids") || "").trim();

  if (!rawJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawJson);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .filter((value, index, allValues) => allValues.indexOf(value) === index);
  } catch {
    throw new Error("Nao foi possivel ler a selecao manual de destinatarios.");
  }
}

async function getWaitlistRecipientsByIds(tenantId: string, waitlistIds: string[]) {
  const recipients: WaitlistMatch[] = [];

  for (const idChunk of chunkArray(waitlistIds, 200)) {
    const { data, error } = await supabaseServer
      .from("waitlist_requests")
      .select("id,cpf,nome,telefone,praca,horario_label,telegram_chat_id,created_at")
      .eq("tenant_id", tenantId)
      .in("id", idChunk);

    if (error) {
      throw new Error(error.message);
    }

    recipients.push(...((data || []) as WaitlistMatch[]));
  }

  const recipientById = new Map(recipients.map((item) => [item.id, item] as const));

  return waitlistIds
    .map((id) => recipientById.get(id))
    .filter(Boolean)
    .reduce<ImportedRecipient[]>((accumulator, item) => {
      if (!item) {
        return accumulator;
      }

      const cpf = sanitizeDigits(item.cpf || "");
      const nome = normalizeCell(item.nome);
      const telefone = sanitizeDigits(item.telefone || "");
      const hotzone = normalizeCell(item.praca);
      const turno = normalizeCell(item.horario_label);

      if (!cpf || !nome) {
        return accumulator;
      }

      if (accumulator.some((existingRecipient) => existingRecipient.cpf === cpf)) {
        return accumulator;
      }

      accumulator.push({
        cpf,
        nome,
        telefone,
        hotzone,
        turno,
      });

      return accumulator;
    }, []);
}

async function resolveCampaignRecipients(params: {
  tenantId: string;
  mode: CampaignMode;
  formData: FormData;
}) {
  if (params.mode === "grupo_telegram") {
    return [];
  }

  if (params.mode === "planilha") {
    const spreadsheet = params.formData.get("planilha");

    if (!(spreadsheet instanceof File) || spreadsheet.size === 0) {
      throw new Error("Anexe a planilha da campanha.");
    }

    return parseSpreadsheet(spreadsheet);
  }

  const selectedIds = parseSelectedWaitlistIds(params.formData);

  if (selectedIds.length === 0) {
    throw new Error("Selecione pelo menos uma pessoa da base para disparar a campanha.");
  }

  if (params.mode === "individual" && selectedIds.length !== 1) {
    throw new Error("No modo individual, selecione somente uma pessoa.");
  }

  const recipients = await getWaitlistRecipientsByIds(params.tenantId, selectedIds);

  if (recipients.length === 0) {
    throw new Error("Nenhum destinatario valido foi encontrado na selecao manual.");
  }

  if (params.mode === "individual" && recipients.length !== 1) {
    throw new Error("Nao foi possivel confirmar o destinatario individual selecionado.");
  }

  return recipients;
}

function resolveSelectedTelegramGroups(formData: FormData) {
  const selectedGroupIds = parseSelectedGroupIds(formData);

  if (selectedGroupIds.length === 0) {
    throw new Error("Selecione pelo menos um grupo do Telegram para disparar a campanha.");
  }

  const selectedGroups = TELEGRAM_GROUP_TARGETS.filter((group) => selectedGroupIds.includes(group.id));

  if (selectedGroups.length !== selectedGroupIds.length) {
    throw new Error("Um ou mais grupos selecionados nao sao validos.");
  }

  return selectedGroups;
}

function buildInlineKeyboard(buttons: string[], recipientId: string) {
  return chunkArray(buttons, 2).map((buttonRow, rowIndex) =>
    buttonRow.map((buttonLabel, columnIndex) => {
      const optionIndex = rowIndex * 2 + columnIndex + 1;

      return {
        text: buttonLabel,
        callback_data: `campanha:${recipientId}:${optionIndex}`,
      };
    }),
  );
}

async function sendTelegramMessage(params: {
  token: string;
  chatId: number;
  text: string;
  recipientId: string;
  buttons: string[];
  media: PreparedCampaignMedia | null;
  includeButtons?: boolean;
}) {
  // #region debug-point C:telegram-send-entry
  const reportServerDebugEvent = async (
    hypothesisId: string,
    location: string,
    msg: string,
    data: Record<string, unknown>,
  ) => {
    await fetch("http://127.0.0.1:7778/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: "telegram-image-group-crash",
        runId: "pre-fix",
        hypothesisId,
        location,
        msg,
        data,
        ts: Date.now(),
      }),
      cache: "no-store",
    }).catch(() => {});
  };
  // #endregion

  const shouldIncludeButtons = params.includeButtons ?? true;
  const replyMarkup =
    shouldIncludeButtons && params.buttons.length > 0
      ? {
          inline_keyboard: buildInlineKeyboard(params.buttons, params.recipientId),
        }
      : undefined;

  if (!params.media) {
    const response = await fetch(`https://api.telegram.org/bot${params.token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });

    const rawBody = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body: rawBody.slice(0, 1000),
    };
  }

  const caption = params.text.length <= 1024 ? params.text : "";
  const photoBody = new FormData();
  const mediaBytes = new Uint8Array(params.media.buffer);
  // #region debug-point C:send-photo-input
  await reportServerDebugEvent("C", "campaign-actions.ts:sendPhoto:input", "[DEBUG] sendPhoto branch entered", {
    chatId: params.chatId,
    hasMedia: Boolean(params.media),
    contentType: params.media.contentType,
    fileName: params.media.fileName,
    mediaBytes: mediaBytes.byteLength,
    textLength: params.text.length,
    captionLength: caption.length,
    shouldIncludeButtons,
  });
  // #endregion
  photoBody.append("chat_id", String(params.chatId));
  photoBody.append(
    "photo",
    new Blob([mediaBytes], { type: params.media.contentType }),
    params.media.fileName,
  );

  if (caption) {
    photoBody.append("caption", caption);
  }

  if (replyMarkup && caption) {
    photoBody.append("reply_markup", JSON.stringify(replyMarkup));
  }

  const photoResponse = await fetch(`https://api.telegram.org/bot${params.token}/sendPhoto`, {
    method: "POST",
    body: photoBody,
    cache: "no-store",
  });

  const rawPhotoBody = await photoResponse.text();
  // #region debug-point D:send-photo-result
  await reportServerDebugEvent("D", "campaign-actions.ts:sendPhoto:result", "[DEBUG] sendPhoto completed", {
    chatId: params.chatId,
    ok: photoResponse.ok,
    status: photoResponse.status,
    bodyPreview: rawPhotoBody.slice(0, 300),
  });
  // #endregion

  if (!photoResponse.ok) {
    return {
      ok: false,
      status: photoResponse.status,
      body: rawPhotoBody.slice(0, 1000),
    };
  }

  if (caption) {
    return {
      ok: true,
      status: photoResponse.status,
      body: rawPhotoBody.slice(0, 1000),
    };
  }

  const messageResponse = await fetch(`https://api.telegram.org/bot${params.token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });

  const rawMessageBody = await messageResponse.text();

  return {
    ok: messageResponse.ok,
    status: messageResponse.status,
    body: rawMessageBody.slice(0, 1000),
  };
}

export async function createTelegramCampaignAction(
  _prevState: CampaignActionState = initialState,
  formData: FormData,
): Promise<CampaignActionState> {
  const actor = await requireTelegramCampaignAccess();
  const tenantId = actor.current_tenant.id;
  const nomeCampanha = String(formData.get("nome_campanha") || "").trim();
  const mensagem = String(formData.get("mensagem") || "").trim();
  const modoDisparo = parseCampaignMode(formData.get("target_mode"));
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";

  if (!nomeCampanha) {
    return { status: "error", message: "Informe o nome da campanha." };
  }

  if (!mensagem) {
    return { status: "error", message: "Informe a mensagem da campanha." };
  }

  if (!telegramBotToken) {
    return {
      status: "error",
      message: "TELEGRAM_BOT_TOKEN nao configurado no app web. Sem isso nao da para disparar.",
    };
  }

  let importedRecipients: ImportedRecipient[];
  let buttons: string[];
  let campaignMedia: PreparedCampaignMedia | null;

  try {
    buttons = parseButtonList(formData);
    campaignMedia = await parseCampaignMedia(formData);
    importedRecipients = await resolveCampaignRecipients({
      tenantId,
      mode: modoDisparo,
      formData,
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Nao foi possivel preparar a campanha.",
    };
  }

  try {
    const selectedTelegramGroups =
      modoDisparo === "grupo_telegram" ? resolveSelectedTelegramGroups(formData) : [];
    // #region debug-point C:campaign-entry
    await fetch("http://127.0.0.1:7778/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: "telegram-image-group-crash",
        runId: "pre-fix",
        hypothesisId: "C",
        location: "campaign-actions.ts:createCampaignAction",
        msg: "[DEBUG] campaign action prepared",
        data: {
          mode: modoDisparo,
          hasMedia: Boolean(campaignMedia),
          mediaFileName: campaignMedia?.fileName || null,
          mediaContentType: campaignMedia?.contentType || null,
          selectedTelegramGroups: selectedTelegramGroups.length,
          buttons: buttons.length,
        },
        ts: Date.now(),
      }),
      cache: "no-store",
    }).catch(() => {});
    // #endregion
    const cpfs = importedRecipients.map((item) => item.cpf);
    const { latestWithChat, latestAny } = await getWaitlistMatches(tenantId, cpfs);

    const totalPlanilha = modoDisparo === "grupo_telegram" ? selectedTelegramGroups.length : importedRecipients.length;
    const totalComChatId =
      modoDisparo === "grupo_telegram"
        ? selectedTelegramGroups.length
        : importedRecipients.filter((item) => latestWithChat.has(item.cpf)).length;
    const totalSemChatId = totalPlanilha - totalComChatId;

    const { data: createdCampaign, error: campaignError } = await supabaseServer
      .from("telegram_campaigns")
      .insert({
        tenant_id: tenantId,
        nome_campanha: nomeCampanha,
        mensagem,
        botao_1: buttons[0] || "",
        botao_2: buttons[1] || "",
        botoes: buttons,
        modo_disparo: modoDisparo,
        target_group_names: selectedTelegramGroups.map((group) => group.nome),
        tem_imagem: Boolean(campaignMedia),
        nome_arquivo_imagem: campaignMedia?.fileName || null,
        total_planilha: totalPlanilha,
        total_com_chat_id: totalComChatId,
        total_sem_chat_id: totalSemChatId,
        total_enviado: 0,
        total_erro: 0,
      })
      .select("id")
      .single();

    if (campaignError || !createdCampaign) {
      return {
        status: "error",
        message: campaignError?.message || "Nao foi possivel criar a campanha.",
      };
    }

    const recipientPayload =
      modoDisparo === "grupo_telegram"
        ? selectedTelegramGroups.map((group) => ({
            tenant_id: tenantId,
            campaign_id: createdCampaign.id,
            cpf: `grupo:${group.telegram_chat_id}`,
            nome: group.nome,
            telefone: null,
            hotzone: group.hotzone,
            turno: "Grupo do Telegram",
            telegram_chat_id: group.telegram_chat_id,
            status_disparo: "erro_envio",
            status_resposta: "aguardando",
            resposta: null,
            erro: "Envio ainda nao processado.",
            enviado_em: null,
            respondido_em: null,
          }))
        : importedRecipients.map((item) => {
            const matchedWithChat = latestWithChat.get(item.cpf);
            const matchedAny = latestAny.get(item.cpf);
            const chosenMatch = matchedWithChat || matchedAny;

            return {
              tenant_id: tenantId,
              campaign_id: createdCampaign.id,
              cpf: item.cpf,
              nome: item.nome,
              telefone: item.telefone || chosenMatch?.telefone || null,
              hotzone: item.hotzone || chosenMatch?.praca || null,
              turno: item.turno || chosenMatch?.horario_label || null,
              telegram_chat_id: matchedWithChat?.telegram_chat_id || null,
              status_disparo: matchedWithChat?.telegram_chat_id ? "erro_envio" : "sem_chat_id",
              status_resposta: "aguardando",
              resposta: null,
              erro: matchedWithChat?.telegram_chat_id ? "Envio ainda nao processado." : "CPF nao encontrado ou sem telegram_chat_id.",
              enviado_em: null,
              respondido_em: null,
            };
          });

    const { data: insertedRecipients, error: recipientError } = await supabaseServer
      .from("telegram_campaign_recipients")
      .insert(recipientPayload)
      .select("id,cpf,nome,telefone,hotzone,turno,telegram_chat_id");

    if (recipientError || !insertedRecipients) {
      await supabaseServer.from("telegram_campaigns").delete().eq("id", createdCampaign.id);
      return {
        status: "error",
        message: recipientError?.message || "Nao foi possivel salvar os destinatarios da campanha.",
      };
    }

    let totalEnviado = 0;
    let totalErro = 0;
    const shouldIncludeButtons = modoDisparo === "individual" && buttons.length > 0;

    for (const recipient of insertedRecipients as InsertedRecipient[]) {
      if (!recipient.telegram_chat_id) {
        continue;
      }

      try {
        const renderedMessage =
          modoDisparo === "grupo_telegram"
            ? mensagem
            : buildTelegramMessage(mensagem, {
                cpf: recipient.cpf,
                nome: recipient.nome,
                telefone: recipient.telefone || "",
                hotzone: recipient.hotzone || "",
                turno: recipient.turno || "",
              });
        const result = await sendTelegramMessage({
          token: telegramBotToken,
          chatId: recipient.telegram_chat_id,
          text: renderedMessage,
          recipientId: recipient.id,
          buttons,
          media: campaignMedia,
          includeButtons: shouldIncludeButtons,
        });

        if (result.ok) {
          totalEnviado += 1;
          await supabaseServer
            .from("telegram_campaign_recipients")
            .update({
              status_disparo: "enviado",
              erro: null,
              enviado_em: new Date().toISOString(),
            })
            .eq("id", recipient.id);
          continue;
        }

        totalErro += 1;
        await supabaseServer
          .from("telegram_campaign_recipients")
          .update({
            status_disparo: "erro_envio",
            erro: `Telegram ${result.status}: ${result.body || "sem retorno"}`,
          })
          .eq("id", recipient.id);
      } catch (error) {
        totalErro += 1;
        await supabaseServer
          .from("telegram_campaign_recipients")
          .update({
            status_disparo: "erro_envio",
            erro: error instanceof Error ? error.message : "Falha inesperada ao enviar via Telegram.",
          })
          .eq("id", recipient.id);
      }
    }

    const { error: updateCampaignError } = await supabaseServer
      .from("telegram_campaigns")
      .update({
        total_enviado: totalEnviado,
        total_erro: totalErro,
      })
      .eq("id", createdCampaign.id)
      .eq("tenant_id", tenantId);

    if (updateCampaignError) {
      return {
        status: "error",
        message: updateCampaignError.message,
      };
    }

    revalidatePath("/campanhas-telegram");
    return {
      status: "success",
      message: `Campanha disparada com sucesso. ${totalEnviado} envio(s) realizado(s) e ${totalSemChatId} registro(s) ficaram sem chat_id.`,
      campaignId: createdCampaign.id,
    };
  } catch (error) {
    // #region debug-point D:action-error
    await fetch("http://127.0.0.1:7778/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: "telegram-image-group-crash",
        runId: "pre-fix",
        hypothesisId: "D",
        location: "campaign-actions.ts:createCampaignAction:catch",
        msg: "[DEBUG] campaign action failed",
        data: {
          error: error instanceof Error ? error.message : "unknown",
        },
        ts: Date.now(),
      }),
      cache: "no-store",
    }).catch(() => {});
    // #endregion
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Nao foi possivel processar a campanha.",
    };
  }
}
