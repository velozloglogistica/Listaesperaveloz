import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { SummaryCard } from "@/components/summary-card";
import { canAccessModule, hasCompanyPermission, requireAppUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getDashboardSummary(tenantId: string) {
  const { data: requests, error: requestsError } = await supabaseServer
    .from("waitlist_requests")
    .select("id,status,is_used,praca")
    .eq("tenant_id", tenantId)
    .limit(2000);

  if (requestsError) {
    throw new Error(requestsError.message);
  }

  const { count: teamCount, error: teamError } = await supabaseServer
    .from("tenant_memberships")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (teamError) {
    throw new Error(teamError.message);
  }

  const total = requests?.length || 0;
  const pendentes = requests?.filter((item) => item.status === "pendente").length || 0;
  const agendados = requests?.filter((item) => item.status === "agendado").length || 0;
  const usados = requests?.filter((item) => item.is_used).length || 0;

  return {
    total,
    pendentes,
    agendados,
    usados,
    teamCount: teamCount || 0,
  };
}

export default async function Home() {
  const currentUser = await requireAppUser();

  if (!canAccessModule(currentUser, "dashboard")) {
    redirect("/lista-espera");
  }

  const tenantId = currentUser.current_tenant.id;
  const summary = await getDashboardSummary(tenantId);

  return (
    <AppShell
      currentPath="/"
      title="Painel SaaS"
      description="Entrada principal da plataforma para navegar entre empresas, modulos e operacao."
      user={currentUser}
    >
      <section className="summary-grid">
        <SummaryCard title="Total da fila" value={summary.total} />
        <SummaryCard title="Aguardando acao" value={summary.pendentes} />
        <SummaryCard title="Agendados" value={summary.agendados} />
        <SummaryCard title="Equipe ativa" value={summary.teamCount} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Modulos</h2>
            <p>Escolha o modulo que voce quer abrir para a empresa atual.</p>
          </div>
        </div>
        <div className="module-grid">
          {canAccessModule(currentUser, "waitlist") ? (
            <Link href="/lista-espera" className="module-card">
              <strong>Lista de espera</strong>
              <p>Gerencie solicitacoes, filtros, cards operacionais e cadastro manual.</p>
            </Link>
          ) : null}
          {hasCompanyPermission(currentUser, "manage_users") ? (
            <Link href="/usuarios" className="module-card">
              <strong>Usuarios</strong>
              <p>Crie logins, monte equipe e vincule cada pessoa a uma hierarquia da empresa.</p>
            </Link>
          ) : null}
          {hasCompanyPermission(currentUser, "manage_hierarchies") ? (
            <Link href="/hierarquias" className="module-card">
              <strong>Hierarquias</strong>
              <p>Crie nomes personalizados como Operacional, Supervisao e Backoffice.</p>
            </Link>
          ) : null}
          {canAccessModule(currentUser, "bag_info") ? (
            <Link href="/informacoes-bag" className="module-card">
              <strong>Informacoes de BAG</strong>
              <p>Consulte entregadores, acompanhe retirada de BAG e cadastre novos perfis.</p>
            </Link>
          ) : null}
          {currentUser.is_platform_admin ? (
            <Link href="/equipe-saas" className="module-card">
              <strong>Equipe SaaS</strong>
              <p>Cadastre funcionarios e novos owners com o mesmo painel do owner principal.</p>
            </Link>
          ) : null}
          {currentUser.is_platform_admin ? (
            <Link href="/empresas" className="module-card">
              <strong>Empresas</strong>
              <p>Cadastre clientes, owners iniciais e acompanhe a base multiempresa.</p>
            </Link>
          ) : null}
        </div>
      </section>

      {currentUser.is_platform_admin ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Visao da plataforma</h2>
              <p>Como owner do SaaS, voce acompanha a empresa atual e gerencia novos clientes.</p>
            </div>
          </div>
          <div className="platform-note">
            <p>
              Você está logado como owner global do SaaS e também pode atuar dentro do tenant atual
              para testar módulos antes de liberar para outras empresas.
            </p>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
