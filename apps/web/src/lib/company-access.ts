import {
  CORE_COMPANY_MODULE_SLUGS,
  MODULE_CATALOG,
  type ModuleSlug,
  type PermissionKey,
} from "@/lib/access-config";
import { supabaseServer } from "@/lib/supabase-server";

export type TenantEnabledModule = {
  id: string;
  slug: ModuleSlug;
  name: string;
  description: string;
};

export type AssignedHierarchy = {
  id: string;
  name: string;
  description: string | null;
};

export function isCompanyAccessSchemaMissing(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";

  return code === "42P01" || code === "42703" || /does not exist|Could not find/.test(message);
}

export async function getTenantEnabledModules(tenantId: string): Promise<TenantEnabledModule[]> {
  const { data, error } = await supabaseServer
    .from("tenant_modules")
    .select("is_enabled,modules!inner(id,slug,name,description)")
    .eq("tenant_id", tenantId)
    .eq("is_enabled", true);

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return CORE_COMPANY_MODULE_SLUGS.map((slug) => {
        const module = MODULE_CATALOG.find((item) => item.slug === slug)!;
        return {
          id: slug,
          slug,
          name: module.name,
          description: module.description,
        };
      });
    }

    throw new Error(error.message);
  }

  return (data || []).flatMap((item) => {
    const moduleData = Array.isArray(item.modules) ? item.modules[0] : item.modules;

    if (!moduleData) {
      return [];
    }

    return [
      {
        id: moduleData.id,
        slug: moduleData.slug as ModuleSlug,
        name: moduleData.name,
        description: moduleData.description || "",
      },
    ];
  });
}

export async function getUserHierarchyAccess(userId: string, tenantId: string): Promise<{
  hierarchies: AssignedHierarchy[];
  moduleSlugs: ModuleSlug[];
  permissionKeys: PermissionKey[];
  foundationReady: boolean;
}> {
  const { data, error } = await supabaseServer
    .from("tenant_user_hierarchies")
    .select("hierarchy_id,tenant_hierarchies!inner(id,name,description)")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return {
        hierarchies: [],
        moduleSlugs: [],
        permissionKeys: [],
        foundationReady: false,
      };
    }

    throw new Error(error.message);
  }

  const hierarchies = (data || []).flatMap((item) => {
    const hierarchy = Array.isArray(item.tenant_hierarchies)
      ? item.tenant_hierarchies[0]
      : item.tenant_hierarchies;

    if (!hierarchy) {
      return [];
    }

    return [
      {
        id: hierarchy.id,
        name: hierarchy.name,
        description: hierarchy.description,
      },
    ];
  });

  const hierarchyIds = hierarchies.map((item) => item.id);

  if (hierarchyIds.length === 0) {
    return {
      hierarchies,
      moduleSlugs: [],
      permissionKeys: [],
      foundationReady: true,
    };
  }

  const [{ data: modulesData, error: modulesError }, { data: permissionsData, error: permissionsError }] =
    await Promise.all([
      supabaseServer
        .from("tenant_hierarchy_modules")
        .select("hierarchy_id,modules!inner(slug)")
        .in("hierarchy_id", hierarchyIds),
      supabaseServer
        .from("tenant_hierarchy_permissions")
        .select("hierarchy_id,permission_key")
        .in("hierarchy_id", hierarchyIds),
    ]);

  if (modulesError || permissionsError) {
    const schemaError = modulesError || permissionsError;

    if (isCompanyAccessSchemaMissing(schemaError)) {
      return {
        hierarchies,
        moduleSlugs: [],
        permissionKeys: [],
        foundationReady: false,
      };
    }

    throw new Error((schemaError as { message: string }).message);
  }

  const moduleSlugs = Array.from(
    new Set(
      (modulesData || []).flatMap((item) => {
        const moduleData = Array.isArray(item.modules) ? item.modules[0] : item.modules;
        return moduleData?.slug ? [moduleData.slug as ModuleSlug] : [];
      }),
    ),
  );

  const permissionKeys = Array.from(
    new Set((permissionsData || []).map((item) => item.permission_key as PermissionKey)),
  );

  return {
    hierarchies,
    moduleSlugs,
    permissionKeys,
    foundationReady: true,
  };
}
