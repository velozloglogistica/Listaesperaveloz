import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { SummaryCard } from "@/components/summary-card";
import { TelegramCampaignForm } from "@/components/telegram-campaign-form";
import { requireWaitlistAccess } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type TelegramCampaign = {
  id: string;
  created_at: string;
  nome_campanha: string;
  mensagem: string;
  botao_1: string;
  botao_2: string;
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
  const currentUser = await requireWaitlistAccess();
  const tenantId = currentUser.current_tenant.id;
  const campaigns = await getCampaigns(tenantId);
  const selectedCampaign =
    campaigns.find((item) => item.id === selectedCampaignId) || campaigns[0] || null;
  const recipients = selectedCampaign
    ? await getCampaignRecipients(tenantId, selectedCampaign.id)
    : [];

  const button1Responses = selectedCampaign
    ? recipients.filter((item) => item.resposta === selectedCampaign.botao_1).length
    : 0;
  const button2Responses = selectedCampaign
    ? recipients.filter((item) => item.resposta === selectedCampaign.botao_2).length
    : 0;
  const pendingResponses = recipients.filter((item) => item.status_resposta === "aguardando").length;

  return (
    <AppShell
      currentPath="/campanhas-telegram"
      title="Campanhas Telegram"
      description="Importe uma planilha, dispare mensagens automaticas pelo chat_id e acompanhe as respostas em tempo real."
      user={currentUser}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Nova campanha</h2>
            <p>O disparo cruza o CPF da planilha com `waitlist_requests` e usa apenas `telegram_chat_id`.</p>
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
                <p>
                  Planilha: {campaign.total_planilha} | Enviados: {campaign.total_enviado} | Sem chat:{" "}
                  {campaign.total_sem_chat_id}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>Nenhuma campanha criada</h2>
            <p>Suba a primeira planilha acima para abrir o historico de disparos.</p>
          </div>
        )}
      </section>

      {selectedCampaign ? (
        <>
          <section className="summary-grid">
            <SummaryCard title="Total na planilha" value={selectedCampaign.total_planilha} />
            <SummaryCard title="Com chat_id" value={selectedCampaign.total_com_chat_id} />
            <SummaryCard title="Sem chat_id" value={selectedCampaign.total_sem_chat_id} />
            <SummaryCard title="Enviados" value={selectedCampaign.total_enviado} />
          </section>

          <section className="summary-grid">
            <SummaryCard title="Erros de envio" value={selectedCampaign.total_erro} />
            <SummaryCard title={`Responderam ${selectedCampaign.botao_1}`} value={button1Responses} />
            <SummaryCard title={`Responderam ${selectedCampaign.botao_2}`} value={button2Responses} />
            <SummaryCard title="Ainda sem resposta" value={pendingResponses} />
          </section>

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
              <div className="campaign-variable-list">
                <code>{selectedCampaign.botao_1}</code>
                <code>{selectedCampaign.botao_2}</code>
              </div>
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
