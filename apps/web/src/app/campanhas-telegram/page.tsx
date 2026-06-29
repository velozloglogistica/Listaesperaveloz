import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { SummaryCard } from "@/components/summary-card";
import { TelegramCampaignForm } from "@/components/telegram-campaign-form";
import { requireTelegramCampaignAccess } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type TelegramCampaign = {
  id: string;
  created_at: string;
  nome_campanha: string;
  mensagem: string;
  botao_1: string;
  botao_2: string;
  botoes: string[] | null;
  modo_disparo: "planilha" | "individual" | "grupo" | "grupo_telegram" | null;
  target_group_names: string[] | null;
  tem_imagem: boolean | null;
  nome_arquivo_imagem: string | null;
  total_planilha: number;
  total_com_chat_id: number;
  total_sem_chat_id: number;
  total_enviado: number;
  total_erro: number;
};

type TelegramCampaignRecipient = {
  id: string;
  cpf: string;
  nome: string;
  telefone: string | null;
  hotzone: string | null;
  turno: string | null;
  telegram_chat_id: number | null;
  status_disparo: "enviado" | "sem_chat_id" | "erro_envio";
  status_resposta: "aguardando" | "respondido";
  resposta: string | null;
  erro: string | null;
  enviado_em: string | null;
  respondido_em: string | null;
  created_at: string;
};

type CampaignRecipientOption = {
  id: string;
  cpf: string;
  nome: string;
  telefone: string | null;
  hotzone: string | null;
  turno: string | null;
  telegram_chat_id: number | null;
  created_at: string;
};

function firstParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Manaus",
  }).format(new Date(value));
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function summarizeMessage(value: string, limit = 120) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function getCampaignButtons(campaign: TelegramCampaign | null) {
  if (!campaign) {
    return [];
  }

  const rawButtons = Array.isArray(campaign.botoes) ? campaign.botoes : [campaign.botao_1, campaign.botao_2];
  return rawButtons.filter(Boolean);
}

function getModeLabel(mode: TelegramCampaign["modo_disparo"]) {
  if (mode === "individual") {
    return "Individual";
  }

  if (mode === "grupo") {
    return "Grupo da base";
  }

  if (mode === "grupo_telegram") {
    return "Grupo Telegram";
  }

  return "Planilha";
}

function getDeliveryStatusMeta(status: TelegramCampaignRecipient["status_disparo"]) {
  if (status === "enviado") {
    return { label: "Enviado", className: "day-chip day-chip-success" };
  }

  if (status === "sem_chat_id") {
    return { label: "Sem chat_id", className: "day-chip day-chip-warning" };
  }

  return { label: "Erro no envio", className: "day-chip day-chip-danger" };
}

function getResponseStatusMeta(status: TelegramCampaignRecipient["status_resposta"]) {
  if (status === "respondido") {
    return { label: "Respondido", className: "day-chip day-chip-success" };
  }

  return { label: "Aguardando", className: "day-chip day-chip-info" };
}

function buildCampaignSearchText(campaign: TelegramCampaign) {
  return normalizeSearchValue(
    [
      campaign.nome_campanha,
      getModeLabel(campaign.modo_disparo),
      formatDateTime(campaign.created_at),
      new Date(campaign.created_at).toISOString().slice(0, 10),
    ].join(" "),
  );
}

async function getCampaigns(tenantId: string) {
  const { data, error } = await supabaseServer
    .from("telegram_campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as TelegramCampaign[];
}

async function getCampaignRecipientOptions(tenantId: string) {
  const { data, error } = await supabaseServer
    .from("waitlist_requests")
    .select("id,cpf,nome,telefone,praca,horario_label,telegram_chat_id,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1200);

  if (error) {
    throw new Error(error.message);
  }

  const uniqueRecipients = new Map<string, CampaignRecipientOption>();

  for (const item of data || []) {
    const cpf = String(item.cpf || "").replace(/\D/g, "");
    if (!cpf || uniqueRecipients.has(cpf)) {
      continue;
    }

    uniqueRecipients.set(cpf, {
      id: String(item.id),
      cpf,
      nome: String(item.nome || "Sem nome"),
      telefone: item.telefone ? String(item.telefone) : null,
      hotzone: item.praca ? String(item.praca) : null,
      turno: item.horario_label ? String(item.horario_label) : null,
      telegram_chat_id: typeof item.telegram_chat_id === "number" ? item.telegram_chat_id : null,
      created_at: String(item.created_at || ""),
    });
  }

  return Array.from(uniqueRecipients.values());
}

async function getCampaignRecipients(tenantId: string, campaignId: string) {
  const { data, error } = await supabaseServer
    .from("telegram_campaign_recipients")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as TelegramCampaignRecipient[];
}

export default async function TelegramCampaignsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = (await searchParams) || {};
  const selectedCampaignId = firstParam(resolvedParams.campaign);
  const campaignSearch = firstParam(resolvedParams.campaign_search);
  const currentUser = await requireTelegramCampaignAccess();
  const tenantId = currentUser.current_tenant.id;
  const campaigns = await getCampaigns(tenantId);
  const normalizedCampaignSearch = normalizeSearchValue(campaignSearch);
  const filteredCampaigns = normalizedCampaignSearch
    ? campaigns.filter((campaign) => buildCampaignSearchText(campaign).includes(normalizedCampaignSearch))
    : campaigns;
  const recipientOptions = await getCampaignRecipientOptions(tenantId);
  const selectedCampaign =
    filteredCampaigns.find((item) => item.id === selectedCampaignId) || filteredCampaigns[0] || null;
  const recipients = selectedCampaign
    ? await getCampaignRecipients(tenantId, selectedCampaign.id)
    : [];
  const campaignButtons = getCampaignButtons(selectedCampaign);
  const buttonResponseCards = campaignButtons.map((buttonLabel) => ({
    label: buttonLabel,
    total: recipients.filter((item) => item.resposta === buttonLabel).length,
  }));
  const pendingResponses =
    selectedCampaign?.modo_disparo === "grupo_telegram"
      ? 0
      : recipients.filter((item) => item.status_resposta === "aguardando").length;

  return (
    <AppShell
      currentPath="/campanhas-telegram"
      title="Campanhas Telegram"
      description="Escolha entre planilha, envio individual ou grupos oficiais do Telegram no mesmo fluxo."
      user={currentUser}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Nova campanha</h2>
            <p>Use planilha com preview por CPF, envie para uma pessoa da base ou dispare para grupos oficiais do Telegram.</p>
          </div>
        </div>
        <TelegramCampaignForm baseRecipients={recipientOptions} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Campanhas recentes</h2>
            <p>Busque por nome ou data e abra a campanha em uma lista suspensa, sem poluir a tela.</p>
          </div>
        </div>

        {campaigns.length > 0 ? (
          <div className="campaign-browser-card">
            <form method="get" className="campaign-browser-form">
              <input
                className="text-input courier-search-input"
                type="search"
                name="campaign_search"
                defaultValue={campaignSearch}
                placeholder="Buscar campanha por nome, modo ou data"
              />
              <select
                className="text-input"
                name="campaign"
                defaultValue={selectedCampaign?.id || filteredCampaigns[0]?.id || ""}
              >
                {filteredCampaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.nome_campanha} | {formatDateTime(campaign.created_at)} | {getModeLabel(campaign.modo_disparo)}
                  </option>
                ))}
              </select>
              <button type="submit" className="secondary-button">
                Abrir campanha
              </button>
            </form>

            {filteredCampaigns.length > 0 ? (
              <div className="campaign-browser-summary">
                <strong>{filteredCampaigns.length} campanha(s) encontrada(s)</strong>
                <span>
                  {selectedCampaign
                    ? `Aberta agora: ${selectedCampaign.nome_campanha}`
                    : "Escolha uma campanha para ver os detalhes."}
                </span>
              </div>
            ) : (
              <div className="empty-state">
                <h2>Nenhuma campanha encontrada</h2>
                <p>Ajuste a busca por nome, modo ou data para localizar a campanha.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <h2>Nenhuma campanha criada</h2>
            <p>Crie sua primeira campanha por planilha, individual ou para grupo do Telegram.</p>
          </div>
        )}
      </section>

      {selectedCampaign ? (
        <>
          <section className="summary-grid">
            <SummaryCard
              title="Total selecionado"
              value={selectedCampaign.total_planilha}
            />
            <SummaryCard title="Com chat_id" value={selectedCampaign.total_com_chat_id} />
            <SummaryCard title="Sem chat_id" value={selectedCampaign.total_sem_chat_id} />
            <SummaryCard title="Enviados" value={selectedCampaign.total_enviado} />
          </section>

          <section className="summary-grid">
            <SummaryCard title="Erros de envio" value={selectedCampaign.total_erro} />
            <SummaryCard title="Ainda sem resposta" value={pendingResponses} />
            <SummaryCard title="Modo da campanha" value={getModeLabel(selectedCampaign.modo_disparo)} />
            <SummaryCard title="Imagem anexada" value={selectedCampaign.tem_imagem ? "Sim" : "Nao"} />
          </section>

          {buttonResponseCards.length > 0 && selectedCampaign.modo_disparo !== "grupo_telegram" ? (
            <section className="summary-grid">
              {buttonResponseCards.map((buttonCard) => (
                <SummaryCard
                  key={buttonCard.label}
                  title={`Responderam ${buttonCard.label}`}
                  value={buttonCard.total}
                />
              ))}
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Resumo da campanha</h2>
                <p>{selectedCampaign.nome_campanha}</p>
              </div>
            </div>
            <div className="campaign-message-card">
              <strong>Mensagem enviada</strong>
              <p>{selectedCampaign.mensagem}</p>
              <span className="day-chip day-chip-info">{getModeLabel(selectedCampaign.modo_disparo)}</span>
              {selectedCampaign.tem_imagem ? (
                <span className="day-chip day-chip-success">
                  Imagem anexada{selectedCampaign.nome_arquivo_imagem ? `: ${selectedCampaign.nome_arquivo_imagem}` : ""}
                </span>
              ) : null}
              {selectedCampaign.target_group_names && selectedCampaign.target_group_names.length > 0 ? (
                <div className="campaign-variable-list">
                  {selectedCampaign.target_group_names.map((groupName) => (
                    <code key={groupName}>{groupName}</code>
                  ))}
                </div>
              ) : null}
              {selectedCampaign.modo_disparo !== "grupo_telegram" ? (
                <div className="campaign-variable-list">
                  {campaignButtons.map((buttonLabel) => (
                    <code key={buttonLabel}>{buttonLabel}</code>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Destinatarios</h2>
                <p>{recipients.length} registro(s) desta campanha.</p>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF</th>
                    <th>Mensagem</th>
                    <th>Status envio</th>
                    <th>Status resposta</th>
                    <th>Opcao selecionada</th>
                    <th>Enviado em</th>
                    <th>Respondido em</th>
                    <th>Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((recipient) => (
                    <tr key={recipient.id}>
                      <td>{recipient.nome}</td>
                      <td>{recipient.cpf}</td>
                      <td>
                        <div className="campaign-message-preview">
                          <span>{summarizeMessage(selectedCampaign.mensagem)}</span>
                          {selectedCampaign.mensagem.trim().length > 120 ? (
                            <details className="campaign-message-preview-details">
                              <summary>Ver completa</summary>
                              <p>{selectedCampaign.mensagem}</p>
                            </details>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <span className={getDeliveryStatusMeta(recipient.status_disparo).className}>
                          {getDeliveryStatusMeta(recipient.status_disparo).label}
                        </span>
                      </td>
                      <td>
                        <span className={getResponseStatusMeta(recipient.status_resposta).className}>
                          {getResponseStatusMeta(recipient.status_resposta).label}
                        </span>
                      </td>
                      <td>{recipient.resposta || "-"}</td>
                      <td>{formatDateTime(recipient.enviado_em)}</td>
                      <td>{formatDateTime(recipient.respondido_em)}</td>
                      <td>{recipient.erro || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
