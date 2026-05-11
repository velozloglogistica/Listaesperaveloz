import Link from "next/link";
import { notFound } from "next/navigation";

import { updateTenantUserAction } from "@/app/company-actions";
import { AppShell } from "@/components/app-shell";
import { TenantUserForm } from "@/components/tenant-user-form";
import { requireUserManagementAccess } from "@/lib/auth";
import { isCompanyAccessSchemaMissing } from "@/lib/company-access";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getTenantHierarchies(tenantId: string) {
  const { data, error } = await supabaseServer
    .from("tenant_hierarchies")
    .select("id,name,description")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return [];
    }

    throw new Error(error.message);
  }

  return data || [];
}

async function getTenantUser(tenantId: string, userId: string) {
  const { data: membership, error: membershipError } = await supabaseServer
    .from("tenant_memberships")
    .select(
      "user_id,role,can_access_waitlist,is_active,app_users!tenant_memberships_user_id_fkey!inner(full_name,email)",
    )
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  if (!membership) {
    return null;
  }

  const { data: hierarchyLinks, error: hierarchyLinksError } = await supabaseServer
    .from("tenant_user_hierarchies")
    .select("hierarchy_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .limit(1);

  if (hierarchyLinksError && !isCompanyAccessSchemaMissing(hierarchyLinksError)) {
    throw new Error(hierarchyLinksError.message);
  }

  const appUser = Array.isArray(membership.app_users) ? membership.app_users[0] : membership.app_users;

  if (!appUser) {
    return null;
  }

  return {
    user_id: membership.user_id,
    full_name: appUser.full_name,
    email: appUser.email,
    base_profile: membership.role === "owner" ? ("owner" as const) : ("member" as const),
    hierarchy_id: hierarchyLinks?.[0]?.hierarchy_id || "",
    is_active: membership.is_active,
  };
}

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const currentUser = await requireUserManagementAccess();
  const tenantId = currentUser.current_tenant.id;
  const { userId } = await params;
  const [hierarchies, tenantUser] = await Promise.all([
    getTenantHierarchies(tenantId),
    getTenantUser(tenantId, userId),
  ]);

  if (!tenantUser) {
    notFound();
  }

  return (
    <AppShell
      currentPath="/usuarios"
      title="Editar usuario"
      description="Atualize dados, hierarquia e status do login da empresa."
      user={currentUser}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Editar acesso</h2>
            <p>A hierarquia continua definindo modulos e permissoes para usuarios comuns.</p>
          </div>
          <Link href="/usuarios" className="secondary-button link-button">
            Voltar
          </Link>
        </div>
        <TenantUserForm
          hierarchies={hierarchies}
          action={updateTenantUserAction}
          submitLabel="Salvar alteracoes"
          initialValues={tenantUser}
        />
      </section>
    </AppShell>
  );
}
