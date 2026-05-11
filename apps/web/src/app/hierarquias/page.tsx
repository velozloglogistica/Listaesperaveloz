import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { HierarchyForm } from "@/components/hierarchy-form";
import { SummaryCard } from "@/components/summary-card";
import { requireHierarchyManagementAccess } from "@/lib/auth";
import { getTenantEnabledModules, isCompanyAccessSchemaMissing } from "@/lib/company-access";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type HierarchyView = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  modules: string[];
  permissions: string[];
  members: number;
};

async function getHierarchies(
  tenantId: string,
): Promise<{ foundationReady: boolean; data: HierarchyView[] }> {
  const { data: hierarchies, error: hierarchiesError } = await supabaseServer
    .from("tenant_hierarchies")
    .select("id,name,description,is_active,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (hierarchiesError) {
    if (isCompanyAccessSchemaMissing(hierarchiesError)) {
      return { foundationReady: false, data: [] as HierarchyView[] };
    }

    throw new Error(hierarchiesError.message);
  }

  const hierarchyIds = (hierarchies || []).map((item) => item.id);

  if (hierarchyIds.length === 0) {
    return { foundationReady: true, data: [] as HierarchyView[] };
  }

  const [{ data: modules, error: modulesError }, { data: permissions, error: permissionsError }, { data: members, error: membersError }] =
    await Promise.all([
      supabaseServer
        .from("tenant_hierarchy_modules")
        .select("hierarchy_id,modules!inner(name)")
        .in("hierarchy_id", hierarchyIds),
      supabaseServer
        .from("tenant_hierarchy_permissions")
        .select("hierarchy_id,permission_key")
        .in("hierarchy_id", hierarchyIds),
      supabaseServer
        .from("tenant_user_hierarchies")
        .select("hierarchy_id")
        .eq("tenant_id", tenantId)
        .in("hierarchy_id", hierarchyIds),
    ]);

  const schemaError = modulesError || permissionsError || membersError;

  if (schemaError) {
    if (isCompanyAccessSchemaMissing(schemaError)) {
      return { foundationReady: false, data: [] as HierarchyView[] };
    }

    throw new Error(schemaError.message);
  }

  const moduleMap = (modules || []).reduce<Record<string, string[]>>((acc, item) => {
    const moduleData = Array.isArray(item.modules) ? item.modules[0] : item.modules;

    if (!moduleData?.name) {
      return acc;
    }

    acc[item.hierarchy_id] = acc[item.hierarchy_id]
      ? [...acc[item.hierarchy_id], moduleData.name]
      : [moduleData.name];
    return acc;
  }, {});

  const permissionMap = (permissions || []).reduce<Record<string, string[]>>((acc, item) => {
    acc[item.hierarchy_id] = acc[item.hierarchy_id]
      ? [...acc[item.hierarchy_id], item.permission_key]
      : [item.permission_key];
    return acc;
  }, {});

  const memberCountMap = (members || []).reduce<Record<string, number>>((acc, item) => {
    acc[item.hierarchy_id] = (acc[item.hierarchy_id] || 0) + 1;
    return acc;
  }, {});

  return {
    foundationReady: true,
    data: (hierarchies || []).map((hierarchy): HierarchyView => ({
      ...hierarchy,
      modules: moduleMap[hierarchy.id] || [],
      permissions: permissionMap[hierarchy.id] || [],
      members: memberCountMap[hierarchy.id] || 0,
    })),
  };
}

export default async function HierarquiasPage() {
  const currentUser = await requireHierarchyManagementAccess();
  const tenantId = currentUser.current_tenant.id;
  const enabledModules = await getTenantEnabledModules(tenantId);
  const hierarchiesResult = await getHierarchies(tenantId);

  return (
    <AppShell
      currentPath="/hierarquias"
      title="Hierarquias"
      description="Crie os nomes internos da empresa e escolha exatamente o que cada hierarquia pode ver."
      user={currentUser}
    >
      <section className="summary-grid">
        <SummaryCard title="Hierarquias" value={hierarchiesResult.data.length} />
        <SummaryCard title="Modulos liberados" value={enabledModules.length} />
        <SummaryCard
          title="Permissoes extras"
          value={hierarchiesResult.data.reduce((acc, item) => acc + item.permissions.length, 0)}
        />
        <SummaryCard
          title="Pessoas vinculadas"
          value={hierarchiesResult.data.reduce((acc, item) => acc + item.members, 0)}
        />
      </section>

      {!hierarchiesResult.foundationReady ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Ativar base de hierarquias</h2>
              <p>
                Rode a migration `supabase/add_company_hierarchies_and_modules.sql` para liberar
                hierarquias, modulos por empresa e equipes personalizadas.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Nova hierarquia</h2>
                <p>
                  Exemplo: Operacional, Supervisor, Backoffice ou qualquer nome que o owner da
                  empresa quiser usar.
                </p>
              </div>
            </div>
            <HierarchyForm enabledModules={enabledModules} />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Hierarquias cadastradas</h2>
                <p>Cada hierarquia tem modulos e permissoes proprias da empresa atual.</p>
              </div>
            </div>

            <div className="users-list">
              {hierarchiesResult.data.map((hierarchy) => (
                <article key={hierarchy.id} className="user-card user-card-stack">
                  <div>
                    <strong>{hierarchy.name}</strong>
                    <p>{hierarchy.description || "Sem descricao interna."}</p>
                    <p>Modulos: {hierarchy.modules.join(" · ") || "Nenhum modulo vinculado"}</p>
                    <p>
                      Permissoes: {hierarchy.permissions.join(" · ") || "Sem permissao extra"}
                    </p>
                  </div>
                  <div className="user-card-meta">
                    <span className="day-chip">{hierarchy.is_active ? "Ativa" : "Inativa"}</span>
                    <span className="request-time">{hierarchy.members} pessoa(s)</span>
                    <Link
                      href={`/hierarquias/${hierarchy.id}`}
                      className="secondary-button link-button"
                    >
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
