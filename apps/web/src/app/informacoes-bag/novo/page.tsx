import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { BagCourierForm } from "@/components/bag-courier-form";
import { canAccessModule, requireAppUser } from "@/lib/auth";
import { isCompanyAccessSchemaMissing } from "@/lib/company-access";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type TenantCityView = {
  id: string;
  name: string;
  is_active: boolean;
};

type TenantRegionView = {
  id: string;
  name: string;
  city_id: string;
  city_name: string;
  is_active: boolean;
};

type TenantOperatorView = {
  id: string;
  full_name: string;
  role: string;
};

type TenantBagStatusView = {
  id: string;
  slug: string;
  label: string;
};

async function getTenantCities(
  tenantId: string,
): Promise<{ foundationReady: boolean; data: TenantCityView[] }> {
  const { data, error } = await supabaseServer
    .from("tenant_cities")
    .select("id,name,is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { foundationReady: false, data: [] };
    }

    throw new Error(error.message);
  }

  return {
    foundationReady: true,
    data: data || [],
  };
}

async function getTenantRegions(
  tenantId: string,
): Promise<{ foundationReady: boolean; data: TenantRegionView[] }> {
  const { data, error } = await supabaseServer
    .from("tenant_regions")
    .select("id,name,city_id,is_active,tenant_cities!inner(name)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { foundationReady: false, data: [] };
    }

    throw new Error(error.message);
  }

  return {
    foundationReady: true,
    data: (data || []).map((region) => ({
      id: region.id,
      name: region.name,
      city_id: region.city_id,
      city_name:
        Array.isArray(region.tenant_cities) && region.tenant_cities[0]?.name
          ? region.tenant_cities[0].name
          : "",
      is_active: region.is_active,
    })),
  };
}

async function getTenantOperators(tenantId: string): Promise<TenantOperatorView[]> {
  const { data, error } = await supabaseServer
    .from("tenant_memberships")
    .select("user_id,role,app_users!tenant_memberships_user_id_fkey!inner(full_name)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return [];
    }

    throw new Error(error.message);
  }

  return (data || []).flatMap((item) => {
    const appUser = Array.isArray(item.app_users) ? item.app_users[0] : item.app_users;

    if (!appUser?.full_name) {
      return [];
    }

    return [
      {
        id: item.user_id,
        full_name: appUser.full_name,
        role: item.role,
      },
    ];
  });
}

async function getTenantBagStatuses(
  tenantId: string,
): Promise<{ foundationReady: boolean; data: TenantBagStatusView[] }> {
  const { data, error } = await supabaseServer
    .from("tenant_bag_statuses")
    .select("id,slug,label")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { foundationReady: false, data: [] };
    }

    throw new Error(error.message);
  }

  return {
    foundationReady: true,
    data: data || [],
  };
}

export default async function NovoEntregadorPage() {
  const currentUser = await requireAppUser();

  if (!canAccessModule(currentUser, "bag_info")) {
    redirect("/?error=sem_permissao_bag");
  }

  const tenantId = currentUser.current_tenant.id;
  const [citiesResult, regionsResult, operators, bagStatusesResult] = await Promise.all([
    getTenantCities(tenantId),
    getTenantRegions(tenantId),
    getTenantOperators(tenantId),
    getTenantBagStatuses(tenantId),
  ]);

  const foundationReady =
    citiesResult.foundationReady &&
    regionsResult.foundationReady &&
    bagStatusesResult.foundationReady;

  return (
    <AppShell
      currentPath="/informacoes-bag"
      title="Novo entregador"
      description="Preencha os dados do entregador sem precisar voltar para o fim da listagem."
      user={currentUser}
    >
      {!foundationReady ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Ativar modulo BAG</h2>
              <p>Rode a migration `supabase/add_bag_information_module.sql` antes de usar este cadastro.</p>
            </div>
            <Link href="/informacoes-bag" className="secondary-button link-button">
              Voltar para entregadores
            </Link>
          </div>
        </section>
      ) : null}

      {foundationReady && citiesResult.data.length === 0 ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Configure o Perfil da empresa</h2>
              <p>Cadastre a primeira cidade antes de criar um novo entregador.</p>
            </div>
            <Link href="/perfil-empresa" className="secondary-button link-button">
              Abrir Perfil da empresa
            </Link>
          </div>
        </section>
      ) : null}

      {foundationReady && citiesResult.data.length > 0 && regionsResult.data.length === 0 ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Cadastre pelo menos uma Hot Zone</h2>
              <p>O entregador precisa informar em qual Hot Zone deseja atuar.</p>
            </div>
            <Link href="/perfil-empresa" className="secondary-button link-button">
              Abrir Perfil da empresa
            </Link>
          </div>
        </section>
      ) : null}

      {foundationReady && bagStatusesResult.data.length === 0 ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Cadastre pelo menos um status BAG</h2>
              <p>O cadastro precisa de um status de BAG ativo para salvar o entregador.</p>
            </div>
            <Link href="/perfil-empresa" className="secondary-button link-button">
              Abrir Perfil da empresa
            </Link>
          </div>
        </section>
      ) : null}

      {foundationReady && operators.length === 0 ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Sem operadores ativos</h2>
              <p>Ative usuarios da empresa antes de vincular quem fez o cadastro.</p>
            </div>
            <Link href="/informacoes-bag" className="secondary-button link-button">
              Voltar para entregadores
            </Link>
          </div>
        </section>
      ) : null}

      {foundationReady &&
      citiesResult.data.length > 0 &&
      regionsResult.data.length > 0 &&
      operators.length > 0 &&
      bagStatusesResult.data.length > 0 ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Cadastrar entregador</h2>
              <p>Preencha os dados abaixo para incluir um novo entregador na base.</p>
            </div>
            <Link href="/informacoes-bag" className="secondary-button link-button">
              Voltar para entregadores
            </Link>
          </div>

          <BagCourierForm
            cities={citiesResult.data}
            regions={regionsResult.data}
            operators={operators}
            statuses={bagStatusesResult.data}
          />
        </section>
      ) : null}
    </AppShell>
  );
}
