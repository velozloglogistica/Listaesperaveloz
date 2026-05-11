import Link from "next/link";
import { notFound } from "next/navigation";

import { updateHierarchyAction } from "@/app/company-actions";
import { AppShell } from "@/components/app-shell";
import { HierarchyForm } from "@/components/hierarchy-form";
import { requireHierarchyManagementAccess } from "@/lib/auth";
import { getTenantEnabledModules } from "@/lib/company-access";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getHierarchy(tenantId: string, hierarchyId: string) {
  const { data: hierarchy, error: hierarchyError } = await supabaseServer
    .from("tenant_hierarchies")
    .select("id,name,description,is_active")
    .eq("tenant_id", tenantId)
    .eq("id", hierarchyId)
    .maybeSingle();

  if (hierarchyError) {
    throw new Error(hierarchyError.message);
  }

  if (!hierarchy) {
    return null;
  }

  const [{ data: modules, error: modulesError }, { data: permissions, error: permissionsError }] =
    await Promise.all([
      supabaseServer
        .from("tenant_hierarchy_modules")
        .select("modules!inner(slug)")
        .eq("hierarchy_id", hierarchyId),
      supabaseServer
        .from("tenant_hierarchy_permissions")
        .select("permission_key")
        .eq("hierarchy_id", hierarchyId),
    ]);

  if (modulesError || permissionsError) {
    throw new Error(modulesError?.message || permissionsError?.message || "Erro ao carregar hierarquia.");
  }

  return {
    hierarchy_id: hierarchy.id,
    name: hierarchy.name,
    description: hierarchy.description || "",
    is_active: hierarchy.is_active,
    module_slugs: (modules || []).flatMap((item) => {
      const moduleData = Array.isArray(item.modules) ? item.modules[0] : item.modules;
      return moduleData?.slug ? [moduleData.slug] : [];
    }),
    permission_keys: (permissions || []).map((item) => item.permission_key),
  };
}

export default async function EditarHierarquiaPage({
  params,
}: {
  params: Promise<{ hierarchyId: string }>;
}) {
  const currentUser = await requireHierarchyManagementAccess();
  const tenantId = currentUser.current_tenant.id;
  const { hierarchyId } = await params;
  const [enabledModules, hierarchy] = await Promise.all([
    getTenantEnabledModules(tenantId),
    getHierarchy(tenantId, hierarchyId),
  ]);

  if (!hierarchy) {
    notFound();
  }

  return (
    <AppShell
      currentPath="/hierarquias"
      title="Editar hierarquia"
      description="Ajuste nome, modulos e permissoes da hierarquia da empresa."
      user={currentUser}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Editar hierarquia</h2>
            <p>Atualize acessos e status sem perder o nome interno criado pela empresa.</p>
          </div>
          <Link href="/hierarquias" className="secondary-button link-button">
            Voltar
          </Link>
        </div>
        <HierarchyForm
          enabledModules={enabledModules}
          action={updateHierarchyAction}
          submitLabel="Salvar alteracoes"
          initialValues={hierarchy}
        />
      </section>
    </AppShell>
  );
}
