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
  const currentUser = await requireTelegramCampaignAccess();
  const tenantId = currentUser.current_tenant.id;
  const campaigns = await getCampaigns(tenantId);
  const selectedCampaign =
    campaigns.find((item) => item.id === selectedCampaignId) || campaigns[0] || null;
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
      description="Suba uma planilha, valide quantos CPFs achamos com chat_id e confirme o disparo so depois da analise."
      user={currentUser}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Nova campanha</h2>
            <p>Use a planilha com nome e CPF, veja o cruzamento por CPF com a base e confirme o envio somente para quem tiver chat_id.</p>
          </div>
        </div>
        <TelegramCampaignForm />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Campanhas recentes</h2>
            <p>Abra qualquer campanha para acompanhar envio, sem chat e respostas recebidas.</p>
          </div>
        </div>

        {campaigns.length > 0 ? (
          <div className="module-grid">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campanhas-telegram?campaign=${campaign.id}`}
                className={
                  campaign.id === selectedCampaign?.id ? "module-card module-card-active" : "module-card"
                }
              >
                <strong>{campaign.nome_campanha}</strong>
                <p>{formatDateTime(campaign.created_at)}</p>
                <p>Modo: {getModeLabel(campaign.modo_disparo)}</p>
                <p>
                  Total: {campaign.total_planilha} | Enviados: {campaign.total_enviado} | Sem chat:{" "}
                  {campaign.total_sem_chat_id}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>Nenhuma campanha criada</h2>
            <p>Crie sua primeira campanha por planilha e acompanhe achados, nao encontrados e sem chat_id.</p>
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
                    <th>Telefone</th>
                    <th>Hotzone</th>
                    <th>Turno</th>
                    <th>Status envio</th>
                    <th>Status resposta</th>
                    <th>Resposta</th>
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
                      <td>{recipient.telefone || "-"}</td>
                      <td>{recipient.hotzone || "-"}</td>
                      <td>{recipient.turno || "-"}</td>
                      <td>{recipient.status_disparo}</td>
                      <td>{recipient.status_resposta}</td>
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
