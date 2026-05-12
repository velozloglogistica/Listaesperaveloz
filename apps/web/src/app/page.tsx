import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { SummaryCard } from "@/components/summary-card";
import { canAccessModule, hasCompanyPermission, requireAppUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getSaasDashboardSummary() {
  const [
    { count: companiesCount, error: companiesError },
    { count: activeCompaniesCount, error: activeCompaniesError },
    { count: inactiveCompaniesCount, error: inactiveCompaniesError },
    { count: usersCount, error: usersError },
    { count: activeMembershipsCount, error: membershipsError },
  ] = await Promise.all([
    supabaseServer.from("tenants").select("id", { count: "exact", head: true }),
    supabaseServer.from("tenants").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabaseServer.from("tenants").select("id", { count: "exact", head: true }).eq("is_active", false),
    supabaseServer.from("app_users").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabaseServer
      .from("tenant_memberships")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  if (companiesError || activeCompaniesError || inactiveCompaniesError || usersError || membershipsError) {
    throw new Error(
      companiesError?.message ||
        activeCompaniesError?.message ||
        inactiveCompaniesError?.message ||
        usersError?.message ||
        membershipsError?.message,
    );
  }

  const totalCompanies = companiesCount || 0;
  const totalUsers = usersCount || 0;
  const avgUsersPerCompany =
    totalCompanies > 0 ? Number(((activeMembershipsCount || 0) / totalCompanies).toFixed(1)) : 0;

  return {
    totalCompanies,
    totalUsers,
    avgUsersPerCompany,
    activeCompanies: activeCompaniesCount || 0,
    inactiveCompanies: inactiveCompaniesCount || 0,
  };
}

export default async function Home() {
  const currentUser = await requireAppUser();

  if (!canAccessModule(currentUser, "dashboard")) {
    redirect("/lista-espera");
  }

  const summary = currentUser.is_platform_admin ? await getSaasDashboardSummary() : null;

  return (
    <AppShell
      currentPath="/"
      title="Painel SaaS"
      description="Entrada principal da plataforma para navegar entre empresas, modulos e operacao."
      user={currentUser}
    >
      {summary ? (
        <section className="summary-grid">
          <SummaryCard title="Empresas" value={summary.totalCompanies} />
          <SummaryCard title="Usuarios" value={summary.totalUsers} />
          <SummaryCard title="Ticket medio por empresa" value={summary.avgUsersPerCompany} />
          <SummaryCard title="Empresas ativas" value={summary.activeCompanies} />
          <SummaryCard title="Empresas inativas" value={summary.inactiveCompanies} />
        </section>
      ) : null}

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
