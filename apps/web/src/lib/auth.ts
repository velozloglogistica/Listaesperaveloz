import { redirect } from "next/navigation";

import type { ModuleSlug, PermissionKey } from "@/lib/access-config";
import { getTenantEnabledModules, getUserHierarchyAccess } from "@/lib/company-access";
import { supabaseServer } from "@/lib/supabase-server";
import { createSupabaseAuthClient } from "@/lib/supabase-auth";
import { getDefaultTenant, type Tenant } from "@/lib/tenant";

export type TenantRole = "owner" | "manager" | "area" | "viewer";

export type TenantMembership = {
  id: string;
  tenant_id: string;
  role: TenantRole;
  can_access_waitlist: boolean;
  is_active: boolean;
};

export type AppUser = {
  id: string;
  email: string;
  full_name: string;
  role: string | null;
  is_platform_admin: boolean;
  is_active: boolean;
  current_tenant: Tenant;
  membership: TenantMembership | null;
  enabled_module_slugs: ModuleSlug[];
  permission_keys: PermissionKey[];
  hierarchies: Array<{ id: string; name: string; description: string | null }>;
  access_foundation_ready: boolean;
};

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabaseAuth = await createSupabaseAuthClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user?.id || !user.email) {
    return null;
  }

  const tenant = await getDefaultTenant();
  const { data, error } = await supabaseServer
    .from("app_users")
    .select("id,email,full_name,role,is_platform_admin,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    return null;
  }

  const { data: membershipData, error: membershipError } = await supabaseServer
    .from("tenant_memberships")
    .select("id,tenant_id,role,can_access_waitlist,is_active")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const enabledModules = await getTenantEnabledModules(tenant.id);
  const hierarchyAccess = membershipData
    ? await getUserHierarchyAccess(user.id, tenant.id)
    : {
        hierarchies: [],
        moduleSlugs: [],
        permissionKeys: [],
        foundationReady: false,
      };

  const tenantEnabledSlugs = enabledModules.map((item) => item.slug);
  const isTenantOwner = membershipData?.role === "owner";
  const enabledModuleSlugs = Array.from(
    new Set([
      ...(data.is_platform_admin ? tenantEnabledSlugs : []),
      ...(isTenantOwner ? tenantEnabledSlugs : []),
      ...(membershipData?.can_access_waitlist ? (["waitlist"] as ModuleSlug[]) : []),
      ...hierarchyAccess.moduleSlugs,
    ]),
  );

  const permissionKeys = Array.from(
    new Set([
      ...(data.is_platform_admin
        ? (["manage_users", "manage_hierarchies", "manage_modules", "view_reports", "edit_settings"] as PermissionKey[])
        : []),
      ...(isTenantOwner
        ? (["manage_users", "manage_hierarchies", "manage_modules", "view_reports", "edit_settings"] as PermissionKey[])
        : []),
      ...hierarchyAccess.permissionKeys,
    ]),
  );

  return {
    ...(data as Omit<AppUser, "current_tenant" | "membership">),
    current_tenant: tenant,
    membership: (membershipData as TenantMembership | null) || null,
    enabled_module_slugs: enabledModuleSlugs,
    permission_keys: permissionKeys,
    hierarchies: hierarchyAccess.hierarchies,
    access_foundation_ready: hierarchyAccess.foundationReady,
  };
}

export async function requireAppUser() {
  const user = await getCurrentAppUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireWaitlistAccess() {
  const user = await requireAppUser();

  if (!canAccessModule(user, "waitlist")) {
    redirect("/login?error=sem_permissao");
  }

  return user;
}

export async function requireOwner() {
  const user = await requireAppUser();

  if (user.membership?.role !== "owner") {
    redirect("/?error=sem_permissao_owner");
  }

  return user;
}

export async function requirePlatformAdmin() {
  const user = await requireAppUser();

  if (!user.is_platform_admin) {
    redirect("/?error=sem_permissao_plataforma");
  }

  return user;
}

export function canAccessModule(user: AppUser, moduleSlug: ModuleSlug) {
  return user.is_platform_admin || user.enabled_module_slugs.includes(moduleSlug);
}

export function hasCompanyPermission(user: AppUser, permissionKey: PermissionKey) {
  return user.is_platform_admin || user.permission_keys.includes(permissionKey);
}

export async function requireUserManagementAccess() {
  const user = await requireAppUser();

  if (!hasCompanyPermission(user, "manage_users")) {
    redirect("/?error=sem_permissao_usuarios");
  }

  return user;
}

export async function requireHierarchyManagementAccess() {
  const user = await requireAppUser();

  if (!hasCompanyPermission(user, "manage_hierarchies")) {
    redirect("/?error=sem_permissao_hierarquias");
  }

  return user;
}

export async function requireSettingsAccess() {
  const user = await requireAppUser();

  if (!hasCompanyPermission(user, "edit_settings")) {
    redirect("/?error=sem_permissao_configuracoes");
  }

  return user;
}

export async function ownerExists() {
  const tenant = await getDefaultTenant();
  const { count, error } = await supabaseServer
    .from("tenant_memberships")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("role", "owner")
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return (count || 0) > 0;
}
