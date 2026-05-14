import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { SummaryCard } from "@/components/summary-card";
import { TenantUserForm } from "@/components/tenant-user-form";
import { requireUserManagementAccess } from "@/lib/auth";
import { isCompanyAccessSchemaMissing } from "@/lib/company-access";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type TenantHierarchyOption = {
  id: string;
  name: string;
  description: string | null;
};

type TenantUserView = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  can_access_waitlist: boolean;
  is_active: boolean;
  hierarchies: string[];
};

async function getTenantHierarchies(
  tenantId: string,
): Promise<{ foundationReady: boolean; data: TenantHierarchyOption[] }> {
  const { data, error } = await supabaseServer
    .from("tenant_hierarchies")
    .select("id,name,description")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { foundationReady: false, data: [] as TenantHierarchyOption[] };
    }

    throw new Error(error.message);
  }

  return { foundationReady: true, data: data || [] };
}

async function getTenantUsers(
  tenantId: string,
): Promise<{ foundationReady: boolean; data: TenantUserView[] }> {
  const { data: memberships, error: membershipsError } = await supabaseServer
    .from("tenant_memberships")
    .select(
      "id,user_id,role,can_access_waitlist,is_active,created_at,app_users!tenant_memberships_user_id_fkey!inner(full_name,email,is_active)",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const userIds = (memberships || []).map((item) => item.user_id);

  if (userIds.length === 0) {
    return { foundationReady: true, data: [] as TenantUserView[] };
  }

  const { data: hierarchyLinks, error: hierarchyLinksError } = await supabaseServer
    .from("tenant_user_hierarchies")
    .select("user_id,hierarchy_id,tenant_hierarchies!inner(name)")
    .eq("tenant_id", tenantId)
    .in("user_id", userIds);

  if (hierarchyLinksError) {
    if (isCompanyAccessSchemaMissing(hierarchyLinksError)) {
      return {
        foundationReady: false,
        data: (memberships || []).map((item): TenantUserView => {
          const appUser = Array.isArray(item.app_users) ? item.app_users[0] : item.app_users;
          return {
            id: item.user_id,
            full_name: appUser?.full_name || "",
            email: appUser?.email || "",
            role: item.role,
            can_access_waitlist: item.can_access_waitlist,
            is_active: item.is_active,
            hierarchies: [] as string[],
          };
        }),
      };
    }

    throw new Error(hierarchyLinksError.message);
  }

  const hierarchyMap = (hierarchyLinks || []).reduce<Record<string, string[]>>((acc, item) => {
    const hierarchy = Array.isArray(item.tenant_hierarchies)
      ? item.tenant_hierarchies[0]
      : item.tenant_hierarchies;

    if (!hierarchy?.name) {
      return acc;
    }

    acc[item.user_id] = acc[item.user_id] ? [...acc[item.user_id], hierarchy.name] : [hierarchy.name];
    return acc;
  }, {});

  return {
    foundationReady: true,
    data: (memberships || []).flatMap((item): TenantUserView[] => {
      const appUser = Array.isArray(item.app_users) ? item.app_users[0] : item.app_users;

      if (!appUser) {
        return [];
      }

      return [
        {
          id: item.user_id,
          full_name: appUser.full_name,
          email: appUser.email,
          role: item.role,
          can_access_waitlist: item.can_access_waitlist,
          is_active: item.is_active && appUser.is_active,
          hierarchies: hierarchyMap[item.user_id] || [],
        },
      ];
    }),
  };
}

export default async function UsuariosPage() {
  const currentUser = await requireUserManagementAccess();
  const tenantId = currentUser.current_tenant.id;
  const hierarchyResult = await getTenantHierarchies(tenantId);
  const usersResult = await getTenantUsers(tenantId);

  return (
    <AppShell
      currentPath="/usuarios"
      title="Usuarios"
      description="Cadastre logins da empresa e vincule cada pessoa a hierarquias que definem modulos e permissoes."
      user={currentUser}
    >
      <section className="summary-grid">
        <SummaryCard title="Usuarios ativos" value={usersResult.data.filter((item) => item.is_active).length} />
        <SummaryCard title="Owners" value={usersResult.data.filter((item) => item.role === "owner").length} />
        <SummaryCard title="Hierarquias" value={hierarchyResult.data.length} />
        <SummaryCard
          title="Com Lista de espera"
          value={usersResult.data.filter((item) => item.can_access_waitlist).length}
        />
      </section>

      {!hierarchyResult.foundationReady || !usersResult.foundationReady ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Ativar base de equipes</h2>
              <p>
                Rode a migration `supabase/add_company_hierarchies_and_modules.sql` para usar
                hierarquias, modulos por empresa e cadastro de usuarios por perfil interno.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Novo usuario da empresa</h2>
                <p>
                  Para usuario comum, a hierarquia decide o acesso. Para owner, o sistema libera o
                  tenant inteiro.
                </p>
              </div>
            </div>
            <TenantUserForm
              hierarchies={hierarchyResult.data}
              canManageOwner={currentUser.is_platform_admin || currentUser.membership?.role === "owner"}
            />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Usuarios cadastrados</h2>
                <p>Veja o papel base, a hierarquia e os modulos principais de cada pessoa.</p>
              </div>
            </div>

            <div className="users-list">
              {usersResult.data.map((user) => (
                <article key={user.id} className="user-card user-card-stack">
                  <div>
                    <strong>{user.full_name}</strong>
                    <p>{user.email}</p>
                    <p>Hierarquias: {user.hierarchies.join(" · ") || "Sem hierarquia vinculada"}</p>
                  </div>
                  <div className="user-card-meta">
                    <span className="day-chip">{user.role === "owner" ? "Owner" : "Usuario"}</span>
                    <span className="request-time">
                      {user.can_access_waitlist ? "Lista liberada" : "Sem lista"}
                    </span>
                    <span className="request-time">{user.is_active ? "Ativo" : "Inativo"}</span>
                    <Link href={`/usuarios/${user.id}`} className="secondary-button link-button">
                      Editar
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
