import { AppShell } from "@/components/app-shell";
import { TenantForm } from "@/components/tenant-form";
import { SummaryCard } from "@/components/summary-card";
import { requirePlatformAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getTenants() {
  const { data, error } = await supabaseServer
    .from("tenants")
    .select("id,name,slug,timezone,is_active,created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function getTenantMembersCount(tenantIds: string[]) {
  if (tenantIds.length === 0) {
    return {};
  }

  const { data, error } = await supabaseServer
    .from("tenant_memberships")
    .select("tenant_id")
    .in("tenant_id", tenantIds)
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).reduce<Record<string, number>>((acc, item) => {
    acc[item.tenant_id] = (acc[item.tenant_id] || 0) + 1;
    return acc;
  }, {});
}

async function getTenantOwners(tenantIds: string[]) {
  if (tenantIds.length === 0) {
    return {};
  }

  const { data, error } = await supabaseServer
    .from("tenant_memberships")
    .select("tenant_id,role,app_users!tenant_memberships_user_id_fkey!inner(full_name,email)")
    .in("tenant_id", tenantIds)
    .eq("role", "owner")
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).reduce<Record<string, string[]>>((acc, item) => {
    const appUser = Array.isArray(item.app_users) ? item.app_users[0] : item.app_users;

    if (!appUser) {
      return acc;
    }

    const label = `${appUser.full_name} (${appUser.email})`;
    acc[item.tenant_id] = acc[item.tenant_id] ? [...acc[item.tenant_id], label] : [label];
    return acc;
  }, {});
}

export default async function EmpresasPage() {
  const currentUser = await requirePlatformAdmin();
  const tenants = await getTenants();
  const tenantIds = tenants.map((tenant) => tenant.id);
  const membersCount = await getTenantMembersCount(tenantIds);
  const tenantOwners = await getTenantOwners(tenantIds);

  return (
    <AppShell
      currentPath="/empresas"
      title="Empresas"
      description="Cadastre novos clientes, owner inicial e acompanhe a estrutura multiempresa do SaaS."
      user={currentUser}
    >
      <section className="summary-grid">
        <SummaryCard title="Empresas" value={tenants.length} />
        <SummaryCard
          title="Ativas"
          value={tenants.filter((tenant) => tenant.is_active).length}
        />
        <SummaryCard
          title="Equipe total"
          value={Object.values(membersCount).reduce((acc, count) => acc + count, 0)}
        />
        <SummaryCard title="Tenant atual" value={currentUser.current_tenant.slug} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Nova empresa</h2>
            <p>Crie o tenant e o owner inicial do cliente em um unico fluxo.</p>
          </div>
        </div>
        <TenantForm />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Empresas cadastradas</h2>
            <p>Cada tenant representa um cliente com equipe, acessos e dados isolados.</p>
          </div>
        </div>

        <div className="users-list">
          {tenants.map((tenant) => (
            <article key={tenant.id} className="user-card">
              <div>
                <strong>{tenant.name}</strong>
                <p>
                  {tenant.slug} · {tenant.timezone}
                </p>
                <p>{(tenantOwners[tenant.id] || []).join(" · ") || "Sem owner inicial"}</p>
              </div>
              <div className="user-card-meta">
                <span className="day-chip">{tenant.is_active ? "Ativa" : "Inativa"}</span>
                <span className="request-time">
                  {membersCount[tenant.id] || 0} usuario(s) ativo(s)
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
