"use server";

import { redirect } from "next/navigation";

import { MODULE_CATALOG, PERMISSION_CATALOG } from "@/lib/access-config";
import {
  requireHierarchyManagementAccess,
  requireUserManagementAccess,
  type AppUser,
} from "@/lib/auth";
import { getTenantEnabledModules, isCompanyAccessSchemaMissing } from "@/lib/company-access";
import { supabaseServer } from "@/lib/supabase-server";

export type CompanyActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function validPassword(value: string) {
  return value.length >= 8;
}

function canManageOwnerAccess(actor: AppUser) {
  return actor.is_platform_admin || actor.membership?.role === "owner";
}

async function countActiveOwners(tenantId: string) {
  const { count, error } = await supabaseServer
    .from("tenant_memberships")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return count || 0;
}

function inferMembershipRole(permissionKeys: string[]) {
  if (permissionKeys.includes("manage_users") || permissionKeys.includes("manage_hierarchies")) {
    return "manager";
  }

  return "area";
}

async function resolveHierarchyAccess(tenantId: string, hierarchyId: string) {
  const [{ data: hierarchyData, error: hierarchyError }, { data: hierarchyPermissions, error: permissionsError }, { data: hierarchyModules, error: modulesError }] =
    await Promise.all([
      supabaseServer
        .from("tenant_hierarchies")
        .select("id")
        .eq("id", hierarchyId)
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .maybeSingle(),
      supabaseServer
        .from("tenant_hierarchy_permissions")
        .select("permission_key")
        .eq("hierarchy_id", hierarchyId),
      supabaseServer
        .from("tenant_hierarchy_modules")
        .select("modules!inner(slug)")
        .eq("hierarchy_id", hierarchyId),
    ]);

  return {
    hierarchyData,
    hierarchyError,
    hierarchyPermissions,
    permissionsError,
    hierarchyModules,
    modulesError,
  };
}

export async function createHierarchyAction(
  _prevState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const actor = await requireHierarchyManagementAccess();
  const tenantId = actor.current_tenant.id;
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const selectedModuleSlugs = Array.from(
    new Set(
      formData
        .getAll("module_slugs")
        .map((value) => String(value))
        .filter((value) => MODULE_CATALOG.some((module) => module.slug === value)),
    ),
  );
  const selectedPermissionKeys = Array.from(
    new Set(
      formData
        .getAll("permission_keys")
        .map((value) => String(value))
        .filter((value) => PERMISSION_CATALOG.some((permission) => permission.key === value)),
    ),
  );

  if (name.length < 2) {
    return { status: "error", message: "Digite um nome valido para a hierarquia." };
  }

  if (selectedModuleSlugs.length === 0) {
    return { status: "error", message: "Selecione pelo menos um modulo para a hierarquia." };
  }

  const enabledModules = await getTenantEnabledModules(tenantId);
  const enabledModuleSlugs = new Set<string>(enabledModules.map((item) => item.slug));

  if (selectedModuleSlugs.some((slug) => !enabledModuleSlugs.has(slug))) {
    return {
      status: "error",
      message: "A hierarquia so pode usar modulos ja liberados para a empresa.",
    };
  }

  const { data: hierarchyData, error: hierarchyError } = await supabaseServer
    .from("tenant_hierarchies")
    .insert({
      tenant_id: tenantId,
      name,
      description: description || null,
      is_active: true,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (hierarchyError || !hierarchyData) {
    if (isCompanyAccessSchemaMissing(hierarchyError)) {
      return {
        status: "error",
        message:
          "Falta rodar a migration de hierarquias. Execute supabase/add_company_hierarchies_and_modules.sql.",
      };
    }

    return {
      status: "error",
      message: hierarchyError?.message || "Nao foi possivel criar a hierarquia.",
    };
  }

  const selectedModules = enabledModules.filter((module) => selectedModuleSlugs.includes(module.slug));
  const { error: hierarchyModulesError } = await supabaseServer.from("tenant_hierarchy_modules").insert(
    selectedModules.map((module) => ({
      hierarchy_id: hierarchyData.id,
      module_id: module.id,
    })),
  );

  if (hierarchyModulesError) {
    if (isCompanyAccessSchemaMissing(hierarchyModulesError)) {
      await supabaseServer.from("tenant_hierarchies").delete().eq("id", hierarchyData.id);
      return {
        status: "error",
        message:
          "Falta rodar a migration de hierarquias. Execute supabase/add_company_hierarchies_and_modules.sql.",
      };
    }

    await supabaseServer.from("tenant_hierarchies").delete().eq("id", hierarchyData.id);
    return {
      status: "error",
      message: hierarchyModulesError.message,
    };
  }

  if (selectedPermissionKeys.length > 0) {
    const { error: hierarchyPermissionsError } = await supabaseServer
      .from("tenant_hierarchy_permissions")
      .insert(
        selectedPermissionKeys.map((permissionKey) => ({
          hierarchy_id: hierarchyData.id,
          permission_key: permissionKey,
        })),
      );

    if (hierarchyPermissionsError) {
      if (isCompanyAccessSchemaMissing(hierarchyPermissionsError)) {
        await supabaseServer.from("tenant_hierarchies").delete().eq("id", hierarchyData.id);
        return {
          status: "error",
          message:
            "Falta rodar a migration de hierarquias. Execute supabase/add_company_hierarchies_and_modules.sql.",
        };
      }

      await supabaseServer.from("tenant_hierarchies").delete().eq("id", hierarchyData.id);
      return {
        status: "error",
        message: hierarchyPermissionsError.message,
      };
    }
  }

  redirect("/hierarquias?created=hierarchy");
}

export async function updateHierarchyAction(
  _prevState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const actor = await requireHierarchyManagementAccess();
  const tenantId = actor.current_tenant.id;
  const hierarchyId = String(formData.get("hierarchy_id") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const isActive = String(formData.get("is_active") || "") === "on";
  const selectedModuleSlugs = Array.from(
    new Set(
      formData
        .getAll("module_slugs")
        .map((value) => String(value))
        .filter((value) => MODULE_CATALOG.some((module) => module.slug === value)),
    ),
  );
  const selectedPermissionKeys = Array.from(
    new Set(
      formData
        .getAll("permission_keys")
        .map((value) => String(value))
        .filter((value) => PERMISSION_CATALOG.some((permission) => permission.key === value)),
    ),
  );

  if (!hierarchyId) {
    return { status: "error", message: "Hierarquia invalida." };
  }

  if (name.length < 2) {
    return { status: "error", message: "Digite um nome valido para a hierarquia." };
  }

  if (selectedModuleSlugs.length === 0) {
    return { status: "error", message: "Selecione pelo menos um modulo para a hierarquia." };
  }

  const { data: existingHierarchy, error: existingHierarchyError } = await supabaseServer
    .from("tenant_hierarchies")
    .select("id")
    .eq("id", hierarchyId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existingHierarchyError || !existingHierarchy) {
    return {
      status: "error",
      message: existingHierarchyError?.message || "Hierarquia nao encontrada.",
    };
  }

  const enabledModules = await getTenantEnabledModules(tenantId);
  const enabledModuleSlugs = new Set<string>(enabledModules.map((item) => item.slug));

  if (selectedModuleSlugs.some((slug) => !enabledModuleSlugs.has(slug))) {
    return {
      status: "error",
      message: "A hierarquia so pode usar modulos ja liberados para a empresa.",
    };
  }

  const { error: updateHierarchyError } = await supabaseServer
    .from("tenant_hierarchies")
    .update({
      name,
      description: description || null,
      is_active: isActive,
    })
    .eq("id", hierarchyId)
    .eq("tenant_id", tenantId);

  if (updateHierarchyError) {
    return {
      status: "error",
      message: updateHierarchyError.message,
    };
  }

  const { error: deleteModulesError } = await supabaseServer
    .from("tenant_hierarchy_modules")
    .delete()
    .eq("hierarchy_id", hierarchyId);

  if (deleteModulesError) {
    return { status: "error", message: deleteModulesError.message };
  }

  const { error: deletePermissionsError } = await supabaseServer
    .from("tenant_hierarchy_permissions")
    .delete()
    .eq("hierarchy_id", hierarchyId);

  if (deletePermissionsError) {
    return { status: "error", message: deletePermissionsError.message };
  }

  const selectedModules = enabledModules.filter((module) => selectedModuleSlugs.includes(module.slug));
  const { error: insertModulesError } = await supabaseServer.from("tenant_hierarchy_modules").insert(
    selectedModules.map((module) => ({
      hierarchy_id: hierarchyId,
      module_id: module.id,
    })),
  );

  if (insertModulesError) {
    return { status: "error", message: insertModulesError.message };
  }

  if (selectedPermissionKeys.length > 0) {
    const { error: insertPermissionsError } = await supabaseServer
      .from("tenant_hierarchy_permissions")
      .insert(
        selectedPermissionKeys.map((permissionKey) => ({
          hierarchy_id: hierarchyId,
          permission_key: permissionKey,
        })),
      );

    if (insertPermissionsError) {
      return { status: "error", message: insertPermissionsError.message };
    }
  }

  redirect("/hierarquias?updated=hierarchy");
}

export async function createTenantUserWithHierarchyAction(
  _prevState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const actor = await requireUserManagementAccess();
  const tenantId = actor.current_tenant.id;
  const fullName = String(formData.get("full_name") || "").trim();
  const email = normalizeEmail(String(formData.get("email") || ""));
  const password = String(formData.get("password") || "");
  const baseProfile = String(formData.get("base_profile") || "member");
  const hierarchyId = String(formData.get("hierarchy_id") || "");

  if (fullName.length < 5) {
    return { status: "error", message: "Digite um nome valido para o usuario." };
  }

  if (!email.includes("@")) {
    return { status: "error", message: "Digite um email valido." };
  }

  if (!validPassword(password)) {
    return { status: "error", message: "A senha precisa ter pelo menos 8 caracteres." };
  }

  if (baseProfile !== "owner" && baseProfile !== "member") {
    return { status: "error", message: "Perfil base invalido." };
  }

  if (baseProfile !== "owner" && !hierarchyId) {
    return {
      status: "error",
      message: "Selecione uma hierarquia para vincular esse usuario.",
    };
  }

  if (baseProfile === "owner" && !canManageOwnerAccess(actor)) {
    return {
      status: "error",
      message: "Somente owner da empresa pode conceder acesso de owner.",
    };
  }

  let selectedHierarchyPermissions: string[] = [];
  let selectedHierarchyModules: string[] = [];

  if (baseProfile !== "owner") {
    const { hierarchyData, hierarchyError, hierarchyPermissions, permissionsError, hierarchyModules, modulesError } =
      await resolveHierarchyAccess(tenantId, hierarchyId);

    if (hierarchyError || !hierarchyData) {
      if (isCompanyAccessSchemaMissing(hierarchyError)) {
        return {
          status: "error",
          message:
            "Falta rodar a migration de hierarquias. Execute supabase/add_company_hierarchies_and_modules.sql.",
        };
      }

      return {
        status: "error",
        message: hierarchyError?.message || "Hierarquia invalida para essa empresa.",
      };
    }

    if (permissionsError || modulesError) {
      if (isCompanyAccessSchemaMissing(permissionsError || modulesError)) {
        return {
          status: "error",
          message:
            "Falta rodar a migration de hierarquias. Execute supabase/add_company_hierarchies_and_modules.sql.",
        };
      }

      return {
        status: "error",
        message: permissionsError?.message || modulesError?.message || "Nao foi possivel ler a hierarquia selecionada.",
      };
    }

    selectedHierarchyPermissions = (hierarchyPermissions || []).map((item) => item.permission_key);
    selectedHierarchyModules = (hierarchyModules || []).flatMap((item) => {
      const moduleData = Array.isArray(item.modules) ? item.modules[0] : item.modules;
      return moduleData?.slug ? [moduleData.slug] : [];
    });
  }

  const membershipRole = baseProfile === "owner" ? "owner" : inferMembershipRole(selectedHierarchyPermissions);
  const canAccessWaitlist = baseProfile === "owner" || selectedHierarchyModules.includes("waitlist");

  const { data, error } = await supabaseServer.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (error || !data.user) {
    return {
      status: "error",
      message: error?.message || "Nao foi possivel criar o login do usuario.",
    };
  }

  const userId = data.user.id;

  const { error: profileError } = await supabaseServer.from("app_users").insert({
    id: userId,
    email,
    full_name: fullName,
    role: baseProfile === "owner" ? "owner" : "area",
    can_access_waitlist: canAccessWaitlist,
    is_platform_admin: false,
    is_active: true,
    created_by: actor.id,
  });

  if (profileError) {
    await supabaseServer.auth.admin.deleteUser(userId);
    return {
      status: "error",
      message: profileError.message,
    };
  }

  const { error: membershipError } = await supabaseServer.from("tenant_memberships").insert({
    tenant_id: tenantId,
    user_id: userId,
    role: membershipRole,
    can_access_waitlist: canAccessWaitlist,
    is_active: true,
    created_by: actor.id,
  });

  if (membershipError) {
    await supabaseServer.from("app_users").delete().eq("id", userId);
    await supabaseServer.auth.admin.deleteUser(userId);
    return {
      status: "error",
      message: membershipError.message,
    };
  }

  if (baseProfile !== "owner") {
    const { error: hierarchyAssignError } = await supabaseServer.from("tenant_user_hierarchies").insert({
      tenant_id: tenantId,
      user_id: userId,
      hierarchy_id: hierarchyId,
      assigned_by: actor.id,
    });

    if (hierarchyAssignError) {
      if (isCompanyAccessSchemaMissing(hierarchyAssignError)) {
        await supabaseServer.from("tenant_memberships").delete().eq("tenant_id", tenantId).eq("user_id", userId);
        await supabaseServer.from("app_users").delete().eq("id", userId);
        await supabaseServer.auth.admin.deleteUser(userId);
        return {
          status: "error",
          message:
            "Falta rodar a migration de hierarquias. Execute supabase/add_company_hierarchies_and_modules.sql.",
        };
      }

      await supabaseServer.from("tenant_memberships").delete().eq("tenant_id", tenantId).eq("user_id", userId);
      await supabaseServer.from("app_users").delete().eq("id", userId);
      await supabaseServer.auth.admin.deleteUser(userId);
      return {
        status: "error",
        message: hierarchyAssignError.message,
      };
    }
  }

  redirect("/usuarios?created=user");
}

export async function updateTenantUserAction(
  _prevState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const actor = await requireUserManagementAccess();
  const tenantId = actor.current_tenant.id;
  const userId = String(formData.get("user_id") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const email = normalizeEmail(String(formData.get("email") || ""));
  const password = String(formData.get("password") || "");
  const baseProfile = String(formData.get("base_profile") || "member");
  const hierarchyId = String(formData.get("hierarchy_id") || "");
  const isActive = String(formData.get("is_active") || "") === "on";

  if (!userId) {
    return { status: "error", message: "Usuario invalido." };
  }

  if (fullName.length < 5) {
    return { status: "error", message: "Digite um nome valido para o usuario." };
  }

  if (!email.includes("@")) {
    return { status: "error", message: "Digite um email valido." };
  }

  if (password && !validPassword(password)) {
    return { status: "error", message: "A nova senha precisa ter pelo menos 8 caracteres." };
  }

  if (baseProfile !== "owner" && baseProfile !== "member") {
    return { status: "error", message: "Perfil base invalido." };
  }

  if (baseProfile !== "owner" && !hierarchyId) {
    return {
      status: "error",
      message: "Selecione uma hierarquia para vincular esse usuario.",
    };
  }

  if (actor.id === userId && !isActive) {
    return {
      status: "error",
      message: "Nao e permitido inativar o proprio usuario por essa tela.",
    };
  }

  const { data: existingMembership, error: existingMembershipError } = await supabaseServer
    .from("tenant_memberships")
    .select("user_id,role,is_active")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingMembershipError || !existingMembership) {
    return {
      status: "error",
      message: existingMembershipError?.message || "Usuario nao encontrado nessa empresa.",
    };
  }

  const targetIsOwner = existingMembership.role === "owner";
  const actorCanManageOwners = canManageOwnerAccess(actor);

  if (targetIsOwner && !actorCanManageOwners) {
    return {
      status: "error",
      message: "Somente owner da empresa pode editar o acesso de outro owner.",
    };
  }

  if (!targetIsOwner && baseProfile === "owner" && !actorCanManageOwners) {
    return {
      status: "error",
      message: "Somente owner da empresa pode promover um usuario para owner.",
    };
  }

  if (actor.id === userId && targetIsOwner && baseProfile !== "owner") {
    return {
      status: "error",
      message: "Nao e permitido remover o proprio acesso de owner por essa tela.",
    };
  }

  if (targetIsOwner && (!isActive || baseProfile !== "owner")) {
    const activeOwnerCount = await countActiveOwners(tenantId);

    if (activeOwnerCount <= 1 && existingMembership.is_active) {
      return {
        status: "error",
        message: "A empresa precisa manter pelo menos um owner ativo.",
      };
    }
  }

  let selectedHierarchyPermissions: string[] = [];
  let selectedHierarchyModules: string[] = [];

  if (baseProfile !== "owner") {
    const { hierarchyData, hierarchyError, hierarchyPermissions, permissionsError, hierarchyModules, modulesError } =
      await resolveHierarchyAccess(tenantId, hierarchyId);

    if (hierarchyError || !hierarchyData) {
      if (isCompanyAccessSchemaMissing(hierarchyError)) {
        return {
          status: "error",
          message:
            "Falta rodar a migration de hierarquias. Execute supabase/add_company_hierarchies_and_modules.sql.",
        };
      }

      return {
        status: "error",
        message: hierarchyError?.message || "Hierarquia invalida para essa empresa.",
      };
    }

    if (permissionsError || modulesError) {
      if (isCompanyAccessSchemaMissing(permissionsError || modulesError)) {
        return {
          status: "error",
          message:
            "Falta rodar a migration de hierarquias. Execute supabase/add_company_hierarchies_and_modules.sql.",
        };
      }

      return {
        status: "error",
        message:
          permissionsError?.message ||
          modulesError?.message ||
          "Nao foi possivel ler a hierarquia selecionada.",
      };
    }

    selectedHierarchyPermissions = (hierarchyPermissions || []).map((item) => item.permission_key);
    selectedHierarchyModules = (hierarchyModules || []).flatMap((item) => {
      const moduleData = Array.isArray(item.modules) ? item.modules[0] : item.modules;
      return moduleData?.slug ? [moduleData.slug] : [];
    });
  }

  const membershipRole = baseProfile === "owner" ? "owner" : inferMembershipRole(selectedHierarchyPermissions);
  const canAccessWaitlist = baseProfile === "owner" || selectedHierarchyModules.includes("waitlist");

  const updatePayload: {
    email: string;
    email_confirm?: boolean;
    password?: string;
    user_metadata: { full_name: string };
    ban_duration?: string;
  } = {
    email,
    user_metadata: {
      full_name: fullName,
    },
  };

  if (password) {
    updatePayload.password = password;
  }

  if (!isActive) {
    updatePayload.ban_duration = "876000h";
  }

  const { error: authUpdateError } = await supabaseServer.auth.admin.updateUserById(userId, updatePayload);

  if (authUpdateError) {
    return {
      status: "error",
      message: authUpdateError.message,
    };
  }

  if (isActive) {
    await supabaseServer.auth.admin.updateUserById(userId, { ban_duration: "none" });
  }

  const { error: profileUpdateError } = await supabaseServer
    .from("app_users")
    .update({
      email,
      full_name: fullName,
      role: baseProfile === "owner" ? "owner" : "area",
      can_access_waitlist: canAccessWaitlist,
      is_active: isActive,
    })
    .eq("id", userId);

  if (profileUpdateError) {
    return {
      status: "error",
      message: profileUpdateError.message,
    };
  }

  const { error: membershipUpdateError } = await supabaseServer
    .from("tenant_memberships")
    .update({
      role: membershipRole,
      can_access_waitlist: canAccessWaitlist,
      is_active: isActive,
    })
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (membershipUpdateError) {
    return {
      status: "error",
      message: membershipUpdateError.message,
    };
  }

  const { error: deleteHierarchyLinksError } = await supabaseServer
    .from("tenant_user_hierarchies")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (deleteHierarchyLinksError && !isCompanyAccessSchemaMissing(deleteHierarchyLinksError)) {
    return {
      status: "error",
      message: deleteHierarchyLinksError.message,
    };
  }

  if (baseProfile !== "owner") {
    const { error: hierarchyAssignError } = await supabaseServer.from("tenant_user_hierarchies").insert({
      tenant_id: tenantId,
      user_id: userId,
      hierarchy_id: hierarchyId,
      assigned_by: actor.id,
    });

    if (hierarchyAssignError) {
      return {
        status: "error",
        message: hierarchyAssignError.message,
      };
    }
  }

  redirect("/usuarios?updated=user");
}
