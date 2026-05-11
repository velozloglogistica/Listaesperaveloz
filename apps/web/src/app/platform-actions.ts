"use server";

import { redirect } from "next/navigation";

import { CORE_COMPANY_MODULE_SLUGS, MODULE_CATALOG } from "@/lib/access-config";
import { isCompanyAccessSchemaMissing } from "@/lib/company-access";
import { requirePlatformAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";

export type PlatformActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createPlatformUserAction(
  _prevState: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const platformAdmin = await requirePlatformAdmin();

  const fullName = String(formData.get("full_name") || "").trim();
  const email = normalizeEmail(String(formData.get("email") || ""));
  const password = String(formData.get("password") || "");
  const profileType = String(formData.get("profile_type") || "staff");

  if (fullName.length < 5) {
    return { status: "error", message: "Preencha o nome completo do usuario." };
  }

  if (!email.includes("@")) {
    return { status: "error", message: "Preencha um email valido." };
  }

  if (password.length < 8) {
    return { status: "error", message: "A senha inicial precisa ter pelo menos 8 caracteres." };
  }

  if (profileType !== "owner" && profileType !== "staff") {
    return { status: "error", message: "Tipo de perfil invalido." };
  }

  const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (authError || !authData.user) {
    return {
      status: "error",
      message: authError?.message || "Nao foi possivel criar o login da equipe SaaS.",
    };
  }

  const userId = authData.user.id;
  const appUserRole = profileType === "owner" ? "owner" : "area";

  const { error: profileError } = await supabaseServer.from("app_users").insert({
    id: userId,
    full_name: fullName,
    email,
    role: appUserRole,
    can_access_waitlist: true,
    is_platform_admin: true,
    is_active: true,
    created_by: platformAdmin.id,
  });

  if (profileError) {
    await supabaseServer.auth.admin.deleteUser(userId);
    return {
      status: "error",
      message: profileError.message,
    };
  }

  const { error: membershipError } = await supabaseServer.from("tenant_memberships").insert({
    tenant_id: platformAdmin.current_tenant.id,
    user_id: userId,
    role: "owner",
    can_access_waitlist: true,
    is_active: true,
    created_by: platformAdmin.id,
  });

  if (membershipError) {
    await supabaseServer.from("app_users").delete().eq("id", userId);
    await supabaseServer.auth.admin.deleteUser(userId);
    return {
      status: "error",
      message: membershipError.message,
    };
  }

  redirect("/equipe-saas?created=user");
}

export async function createTenantWithOwnerAction(
  _prevState: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const platformAdmin = await requirePlatformAdmin();

  const companyName = String(formData.get("company_name") || "").trim();
  const companySlug = normalizeSlug(String(formData.get("company_slug") || ""));
  const ownerName = String(formData.get("owner_name") || "").trim();
  const ownerEmail = normalizeEmail(String(formData.get("owner_email") || ""));
  const ownerPassword = String(formData.get("owner_password") || "");
  const selectedModuleSlugs = Array.from(
    new Set(
      formData
        .getAll("module_slugs")
        .map((value) => String(value))
        .filter((value) => MODULE_CATALOG.some((module) => module.slug === value)),
    ),
  );
  const tenantModuleSlugs =
    selectedModuleSlugs.length > 0 ? selectedModuleSlugs : [...CORE_COMPANY_MODULE_SLUGS];

  if (companyName.length < 2 || companySlug.length < 2) {
    return { status: "error", message: "Preencha um nome e slug validos para a empresa." };
  }

  if (ownerName.length < 5) {
    return { status: "error", message: "Preencha o nome completo do owner da empresa." };
  }

  if (!ownerEmail.includes("@")) {
    return { status: "error", message: "Preencha um email valido para o owner." };
  }

  if (ownerPassword.length < 8) {
    return { status: "error", message: "A senha inicial precisa ter pelo menos 8 caracteres." };
  }

  const { data: tenantData, error: tenantError } = await supabaseServer
    .from("tenants")
    .insert({
      name: companyName,
      slug: companySlug,
      legal_name: companyName,
      timezone: "America/Manaus",
      is_active: true,
    })
    .select("id,name,slug")
    .single();

  if (tenantError || !tenantData) {
    return {
      status: "error",
      message: tenantError?.message || "Nao foi possivel criar a empresa.",
    };
  }

  const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: {
      full_name: ownerName,
    },
  });

  if (authError || !authData.user) {
    await supabaseServer.from("tenants").delete().eq("id", tenantData.id);
    return {
      status: "error",
      message: authError?.message || "Nao foi possivel criar o login do owner.",
    };
  }

  const ownerId = authData.user.id;

  const { error: profileError } = await supabaseServer.from("app_users").insert({
    id: ownerId,
    full_name: ownerName,
    email: ownerEmail,
    role: "owner",
    can_access_waitlist: true,
    is_platform_admin: false,
    is_active: true,
    created_by: platformAdmin.id,
  });

  if (profileError) {
    await supabaseServer.auth.admin.deleteUser(ownerId);
    await supabaseServer.from("tenants").delete().eq("id", tenantData.id);
    return {
      status: "error",
      message: profileError.message,
    };
  }

  const { error: membershipError } = await supabaseServer.from("tenant_memberships").insert({
    tenant_id: tenantData.id,
    user_id: ownerId,
    role: "owner",
    can_access_waitlist: true,
    is_active: true,
    created_by: platformAdmin.id,
  });

  if (membershipError) {
    await supabaseServer.from("app_users").delete().eq("id", ownerId);
    await supabaseServer.auth.admin.deleteUser(ownerId);
    await supabaseServer.from("tenants").delete().eq("id", tenantData.id);
    return {
      status: "error",
      message: membershipError.message,
    };
  }

  const { data: modulesData, error: modulesError } = await supabaseServer
    .from("modules")
    .select("id,slug")
    .in("slug", tenantModuleSlugs);

  if (modulesError) {
    if (isCompanyAccessSchemaMissing(modulesError)) {
      await supabaseServer.from("tenant_memberships").delete().eq("tenant_id", tenantData.id).eq("user_id", ownerId);
      await supabaseServer.from("app_users").delete().eq("id", ownerId);
      await supabaseServer.auth.admin.deleteUser(ownerId);
      await supabaseServer.from("tenants").delete().eq("id", tenantData.id);
      return {
        status: "error",
        message:
          "Falta rodar a migration de modulos e hierarquias. Execute supabase/add_company_hierarchies_and_modules.sql.",
      };
    }

    await supabaseServer.from("tenant_memberships").delete().eq("tenant_id", tenantData.id).eq("user_id", ownerId);
    await supabaseServer.from("app_users").delete().eq("id", ownerId);
    await supabaseServer.auth.admin.deleteUser(ownerId);
    await supabaseServer.from("tenants").delete().eq("id", tenantData.id);
    return {
      status: "error",
      message: modulesError.message,
    };
  }

  if (modulesData && modulesData.length > 0) {
    const { error: tenantModulesError } = await supabaseServer.from("tenant_modules").insert(
      modulesData.map((module) => ({
        tenant_id: tenantData.id,
        module_id: module.id,
        is_enabled: true,
        created_by: platformAdmin.id,
      })),
    );

    if (tenantModulesError) {
      if (isCompanyAccessSchemaMissing(tenantModulesError)) {
        await supabaseServer.from("tenant_memberships").delete().eq("tenant_id", tenantData.id).eq("user_id", ownerId);
        await supabaseServer.from("app_users").delete().eq("id", ownerId);
        await supabaseServer.auth.admin.deleteUser(ownerId);
        await supabaseServer.from("tenants").delete().eq("id", tenantData.id);
        return {
          status: "error",
          message:
            "Falta rodar a migration de modulos e hierarquias. Execute supabase/add_company_hierarchies_and_modules.sql.",
        };
      }

      await supabaseServer.from("tenant_memberships").delete().eq("tenant_id", tenantData.id).eq("user_id", ownerId);
      await supabaseServer.from("app_users").delete().eq("id", ownerId);
      await supabaseServer.auth.admin.deleteUser(ownerId);
      await supabaseServer.from("tenants").delete().eq("id", tenantData.id);
      return {
        status: "error",
        message: tenantModulesError.message,
      };
    }
  }

  redirect("/empresas?created=tenant");
}
