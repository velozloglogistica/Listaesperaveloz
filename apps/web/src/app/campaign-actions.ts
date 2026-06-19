"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import * as XLSX from "xlsx";

import { requireWaitlistAccess } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";

export type CampaignActionState = {
  status: "idle" | "error";
  message: string;
};

type ImportedRecipient = {
  cpf: string;
  nome: string;
  telefone: string;
  hotzone: string;
  turno: string;
};

type WaitlistMatch = {
  id: string;
  cpf: string;
  nome: string | null;
  telefone: string | null;
  praca: string | null;
  horario_label: string | null;
  telegram_chat_id: number | null;
  created_at: string;
};

type InsertedRecipient = {
  id: string;
  cpf: string;
  nome: string;
  telefone: string | null;
  hotzone: string | null;
  turno: string | null;
  telegram_chat_id: number | null;
};

const initialState: CampaignActionState = {
  status: "idle",
  message: "",
};

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCell(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveSpreadsheetValue(row: Record<string, unknown>, candidates: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value] as const);

  for (const candidate of candidates) {
    const entry = normalizedEntries.find(([key]) => key === candidate);
    if (entry) {
      return normalizeCell(entry[1]);
    }
  }

  return "";
}

function buildTelegramMessage(template: string, recipient: ImportedRecipient) {
  const variables: Record<string, string> = {
    nome: recipient.nome,
    telefone: recipient.telefone,
    cpf: recipient.cpf,
    hotzone: recipient.hotzone,
    turno: recipient.turno,
  };

  return template.replace(/\{(nome|telefone|cpf|hotzone|turno)\}/gi, (_, key: string) => {
    return variables[key.toLowerCase()] || "";
  });
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function parseSpreadsheet(file: File): Promise<ImportedRecipient[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];

  if (!firstSheet) {
    throw new Error("A planilha nao possui abas validas.");
  }

  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (rows.length === 0) {
    throw new Error("A planilha esta vazia.");
  }

  const imported: ImportedRecipient[] = [];
  const invalidRows: number[] = [];
  const duplicateCpfs = new Set<string>();
  const seenCpfs = new Set<string>();

  rows.forEach((row, index) => {
    const cpf = sanitizeDigits(resolveSpreadsheetValue(row, ["cpf"]));
    const nome = resolveSpreadsheetValue(row, ["nome", "nome_completo"]);
    const telefone = sanitizeDigits(resolveSpreadsheetValue(row, ["telefone", "celular", "fone"]));
    const hotzone = resolveSpreadsheetValue(row, ["hotzone", "praca", "praca_nome"]);
    const turno = resolveSpreadsheetValue(row, ["turno", "horario", "horario_label"]);

    const rowHasAnyData = [cpf, nome, telefone, hotzone, turno].some(Boolean);
    if (!rowHasAnyData) {
      return;
    }

    if (!cpf || cpf.length !== 11 || !nome || !telefone || !hotzone || !turno) {
      invalidRows.push(index + 2);
      return;
    }

    if (seenCpfs.has(cpf)) {
      duplicateCpfs.add(cpf);
      return;
    }

    seenCpfs.add(cpf);
    imported.push({ cpf, nome, telefone, hotzone, turno });
  });

  if (invalidRows.length > 0) {
    throw new Error(
      `A planilha tem linha(s) incompleta(s). Confira as linhas ${invalidRows.slice(0, 8).join(", ")}.`,
    );
  }

  if (duplicateCpfs.size > 0) {
    throw new Error(
      `A planilha possui CPF duplicado. Ajuste antes de enviar: ${Array.from(duplicateCpfs).slice(0, 5).join(", ")}.`,
    );
  }

  if (imported.length === 0) {
    throw new Error("Nenhuma linha valida foi encontrada na planilha.");
  }

  return imported;
}

async function getWaitlistMatches(tenantId: string, cpfs: string[]) {
  const latestWithChat = new Map<string, WaitlistMatch>();
  const latestAny = new Map<string, WaitlistMatch>();

  for (const cpfChunk of chunkArray(cpfs, 200)) {
    const { data, error } = await supabaseServer
      .from("waitlist_requests")
      .select("id,cpf,nome,telefone,praca,horario_label,telegram_chat_id,created_at")
      .eq("tenant_id", tenantId)
      .in("cpf", cpfChunk)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    for (const rawItem of (data || []) as WaitlistMatch[]) {
      if (!latestAny.has(rawItem.cpf)) {
        latestAny.set(rawItem.cpf, rawItem);
      }

      if (rawItem.telegram_chat_id !== null && !latestWithChat.has(rawItem.cpf)) {
        latestWithChat.set(rawItem.cpf, rawItem);
      }
    }
  }

  return { latestWithChat, latestAny };
}

async function sendTelegramMessage(params: {
  token: string;
  chatId: number;
  text: string;
  recipientId: string;
  button1: string;
  button2: string;
}) {
  const response = await fetch(`https://api.telegram.org/bot${params.token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: params.button1,
              callback_data: `campanha:${params.recipientId}:1`,
            },
            {
              text: params.button2,
              callback_data: `campanha:${params.recipientId}:2`,
            },
          ],
        ],
      },
    }),
  });

  const rawBody = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    body: rawBody.slice(0, 1000),
  };
}

export async function createTelegramCampaignAction(
  _prevState: CampaignActionState = initialState,
  formData: FormData,
): Promise<CampaignActionState> {
  const actor = await requireWaitlistAccess();
  const tenantId = actor.current_tenant.id;
  const nomeCampanha = String(formData.get("nome_campanha") || "").trim();
  const mensagem = String(formData.get("mensagem") || "").trim();
  const botao1 = String(formData.get("botao_1") || "").trim();
  const botao2 = String(formData.get("botao_2") || "").trim();
  const spreadsheet = formData.get("planilha");
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";

  if (!nomeCampanha) {
    return { status: "error", message: "Informe o nome da campanha." };
  }

  if (!mensagem) {
    return { status: "error", message: "Informe a mensagem da campanha." };
  }

  if (!botao1 || !botao2) {
    return { status: "error", message: "Preencha os dois botoes da campanha." };
  }

  if (botao1.toLowerCase() === botao2.toLowerCase()) {
    return { status: "error", message: "Os botoes precisam ter textos diferentes." };
  }

  if (!(spreadsheet instanceof File) || spreadsheet.size === 0) {
    return { status: "error", message: "Anexe a planilha da campanha." };
  }

  if (!telegramBotToken) {
    return {
      status: "error",
      message: "TELEGRAM_BOT_TOKEN nao configurado no app web. Sem isso nao da para disparar.",
    };
  }

  let importedRecipients: ImportedRecipient[];

  try {
    importedRecipients = await parseSpreadsheet(spreadsheet);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Nao foi possivel ler a planilha.",
    };
  }

  try {
    const cpfs = importedRecipients.map((item) => item.cpf);
    const { latestWithChat, latestAny } = await getWaitlistMatches(tenantId, cpfs);

    const totalPlanilha = importedRecipients.length;
    const totalComChatId = importedRecipients.filter((item) => latestWithChat.has(item.cpf)).length;
    const totalSemChatId = totalPlanilha - totalComChatId;

    const { data: createdCampaign, error: campaignError } = await supabaseServer
      .from("telegram_campaigns")
      .insert({
        tenant_id: tenantId,
        nome_campanha: nomeCampanha,
        mensagem,
        botao_1: botao1,
        botao_2: botao2,
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

    const recipientPayload = importedRecipients.map((item) => {
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

    for (const recipient of insertedRecipients as InsertedRecipient[]) {
      if (!recipient.telegram_chat_id) {
        continue;
      }

      const sourceRecipient = importedRecipients.find((item) => item.cpf === recipient.cpf);

      if (!sourceRecipient) {
        totalErro += 1;
        await supabaseServer
          .from("telegram_campaign_recipients")
          .update({
            status_disparo: "erro_envio",
            erro: "Destinatario nao encontrado na memoria do disparo.",
          })
          .eq("id", recipient.id);
        continue;
      }

      try {
        const renderedMessage = buildTelegramMessage(mensagem, sourceRecipient);
        const result = await sendTelegramMessage({
          token: telegramBotToken,
          chatId: recipient.telegram_chat_id,
          text: renderedMessage,
          recipientId: recipient.id,
          button1: botao1,
          button2: botao2,
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
    redirect(`/campanhas-telegram?campaign=${createdCampaign.id}`);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Nao foi possivel processar a campanha.",
    };
  }
}
