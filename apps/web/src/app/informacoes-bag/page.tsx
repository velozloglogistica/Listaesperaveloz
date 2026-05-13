import { redirect } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { BagCourierForm } from "@/components/bag-courier-form";
import { BagStatusForm } from "@/components/bag-status-form";
import { SummaryCard } from "@/components/summary-card";
import {
  BAG_SHIFT_LABELS,
  BAG_WEEKDAY_LABELS,
  BAG_VEHICLE_LABELS,
  type BagShift,
  type BagStatus,
  type BagVehicle,
  type BagWeekday,
} from "@/lib/bag-config";
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

type BagCourierView = {
  id: string;
  partner_delivery_id: string;
  full_name: string;
  phone_number: string;
  whatsapp_web_link: string | null;
  identity_number: string | null;
  city_name: string;
  delivery_vehicle: BagVehicle;
  operator_name: string;
  joined_telegram_group: boolean;
  preferred_shifts: BagShift[];
  preferred_weekdays: BagWeekday[];
  observation: string | null;
  bag_status: BagStatus;
  regions: string[];
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
    data: (data || []).flatMap((item) => {
      const city = Array.isArray(item.tenant_cities) ? item.tenant_cities[0] : item.tenant_cities;

      if (!city?.name) {
        return [];
      }

      return [
        {
          id: item.id,
          name: item.name,
          city_id: item.city_id,
          city_name: city.name,
          is_active: item.is_active,
        },
      ];
    }),
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

async function getBagCouriers(
  tenantId: string,
): Promise<{ foundationReady: boolean; data: BagCourierView[] }> {
  const { data: couriersData, error: couriersError } = await supabaseServer
    .from("bag_couriers")
    .select(
      "id,partner_delivery_id,full_name,phone_number,whatsapp_web_link,identity_number,delivery_vehicle,joined_telegram_group,preferred_shifts,preferred_weekdays,observation,bag_status,tenant_cities!inner(name),app_users!bag_couriers_operator_user_id_fkey(full_name)",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (couriersError) {
    if (isCompanyAccessSchemaMissing(couriersError)) {
      return { foundationReady: false, data: [] };
    }

    throw new Error(couriersError.message);
  }

  const courierIds = (couriersData || []).map((item) => item.id);

  if (courierIds.length === 0) {
    return { foundationReady: true, data: [] };
  }

  const { data: regionLinks, error: regionLinksError } = await supabaseServer
    .from("bag_courier_regions")
    .select("bag_courier_id,tenant_regions!inner(name)")
    .in("bag_courier_id", courierIds);

  if (regionLinksError) {
    if (isCompanyAccessSchemaMissing(regionLinksError)) {
      return { foundationReady: false, data: [] };
    }

    throw new Error(regionLinksError.message);
  }

  const regionsByCourier = (regionLinks || []).reduce<Record<string, string[]>>((acc, item) => {
    const region = Array.isArray(item.tenant_regions) ? item.tenant_regions[0] : item.tenant_regions;

    if (!region?.name) {
      return acc;
    }

    acc[item.bag_courier_id] = acc[item.bag_courier_id]
      ? [...acc[item.bag_courier_id], region.name]
      : [region.name];
    return acc;
  }, {});

  return {
    foundationReady: true,
    data: (couriersData || []).flatMap((item) => {
      const city = Array.isArray(item.tenant_cities) ? item.tenant_cities[0] : item.tenant_cities;
      const operator = Array.isArray(item.app_users) ? item.app_users[0] : item.app_users;

      if (!city?.name) {
        return [];
      }

      return [
        {
          id: item.id,
          partner_delivery_id: item.partner_delivery_id,
          full_name: item.full_name,
          phone_number: item.phone_number,
          whatsapp_web_link: item.whatsapp_web_link,
          identity_number: item.identity_number,
          city_name: city.name,
          delivery_vehicle: item.delivery_vehicle as BagVehicle,
          operator_name: operator?.full_name || "Sem operador",
          joined_telegram_group: item.joined_telegram_group,
          preferred_shifts: (item.preferred_shifts || []) as BagShift[],
          preferred_weekdays: (item.preferred_weekdays || []) as BagWeekday[],
          observation: item.observation,
          bag_status: item.bag_status as BagStatus,
          regions: regionsByCourier[item.id] || [],
        },
      ];
    }),
  };
}

function formatShiftLabels(values: BagShift[]) {
  return values.map((value) => BAG_SHIFT_LABELS[value]).join(" · ");
}

function formatWeekdayLabels(values: BagWeekday[]) {
  return values.map((value) => BAG_WEEKDAY_LABELS[value]).join(" · ");
}

export default async function InformacoesBagPage() {
  const currentUser = await requireAppUser();

  if (!canAccessModule(currentUser, "bag_info")) {
    redirect("/?error=sem_permissao_bag");
  }

  const tenantId = currentUser.current_tenant.id;
  const [citiesResult, regionsResult, operators, couriersResult, bagStatusesResult] = await Promise.all([
    getTenantCities(tenantId),
    getTenantRegions(tenantId),
    getTenantOperators(tenantId),
    getBagCouriers(tenantId),
    getTenantBagStatuses(tenantId),
  ]);

  const foundationReady =
    citiesResult.foundationReady &&
    regionsResult.foundationReady &&
    couriersResult.foundationReady &&
    bagStatusesResult.foundationReady;
  const couriers = couriersResult.data;
  const bagStatusLabels = Object.fromEntries(
    bagStatusesResult.data.map((status) => [status.slug, status.label]),
  ) as Record<string, string>;

  return (
    <AppShell
      currentPath="/informacoes-bag"
      title="Informacoes de BAG"
      description="Consulte entregadores, acompanhe status do BAG e cadastre novos perfis pela plataforma."
      user={currentUser}
    >
      {!foundationReady ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Ativar modulo BAG</h2>
              <p>
                Rode a migration `supabase/add_bag_information_module.sql` para liberar cidades,
                regioes e cadastro de entregadores BAG.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="summary-grid">
            <SummaryCard title="Entregadores" value={couriers.length} />
            {bagStatusesResult.data.map((status) => (
              <SummaryCard
                key={status.id}
                title={status.label}
                value={couriers.filter((item) => item.bag_status === status.slug).length}
              />
            ))}
          </section>

          {citiesResult.data.length === 0 ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Configure o Perfil da empresa</h2>
                  <p>Cadastre a primeira cidade no Perfil da empresa antes de criar entregadores no modulo BAG.</p>
                </div>
                <Link href="/perfil-empresa" className="secondary-button link-button">
                  Abrir Perfil da empresa
                </Link>
              </div>
            </section>
          ) : null}

          {citiesResult.data.length > 0 && regionsResult.data.length === 0 ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Cadastre pelo menos uma Hot Zone</h2>
                  <p>
                    O entregador precisa informar qual Hot Zone deseja atuar antes de ser salvo no
                    banco.
                  </p>
                </div>
                <Link href="/perfil-empresa" className="secondary-button link-button">
                  Abrir Perfil da empresa
                </Link>
              </div>
            </section>
          ) : null}

          {bagStatusesResult.data.length === 0 ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Cadastre pelo menos um status BAG</h2>
                  <p>
                    O entregador precisa receber um status BAG da propria empresa antes de ser salvo
                    no banco.
                  </p>
                </div>
                <Link href="/perfil-empresa" className="secondary-button link-button">
                  Abrir Perfil da empresa
                </Link>
              </div>
            </section>
          ) : null}

          {operators.length === 0 ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Sem operadores ativos</h2>
                  <p>Ative usuarios da empresa antes de vincular quem fez o cadastro do entregador.</p>
                </div>
              </div>
            </section>
          ) : null}

          {citiesResult.data.length > 0 &&
          regionsResult.data.length > 0 &&
          operators.length > 0 &&
          bagStatusesResult.data.length > 0 ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Novo entregador</h2>
                  <p>Cadastre os novos entregadores que retiraram BAG ou ainda precisam retirar.</p>
                </div>
              </div>
              <BagCourierForm
                cities={citiesResult.data}
                regions={regionsResult.data}
                operators={operators}
                statuses={bagStatusesResult.data}
              />
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Entregadores cadastrados</h2>
                <p>Consulte rapidamente se o entregador esta com BAG, precisa retirar ou ja foi desvinculado.</p>
              </div>
            </div>

            <div className="users-list">
              {couriers.length > 0 ? (
                couriers.map((courier) => (
                  <article key={courier.id} className="user-card user-card-stack">
                    <div>
                      <strong>
                        {courier.full_name} · ID {courier.partner_delivery_id}
                      </strong>
                      <p>Telefone: {courier.phone_number}</p>
                      <p>Cidade: {courier.city_name}</p>
                      <p>Hot Zones: {courier.regions.join(" · ") || "Sem Hot Zone definida"}</p>
                      <p>Turnos: {formatShiftLabels(courier.preferred_shifts)}</p>
                      <p>Dias: {formatWeekdayLabels(courier.preferred_weekdays)}</p>
                      <p>Veiculo: {BAG_VEHICLE_LABELS[courier.delivery_vehicle]}</p>
                      <p>Operador: {courier.operator_name}</p>
                      <p>Telegram: {courier.joined_telegram_group ? "Sim" : "Nao"}</p>
                      <p>Identidade: {courier.identity_number || "Nao informada"}</p>
                      <p>Observacao: {courier.observation || "Sem observacoes"}</p>
                      {courier.whatsapp_web_link ? (
                        <p>
                          <a
                            href={courier.whatsapp_web_link}
                            target="_blank"
                            rel="noreferrer"
                            className="secondary-button link-button"
                          >
                            Abrir WhatsApp Web
                          </a>
                        </p>
                      ) : null}
                    </div>
                    <div className="user-card-meta">
                      <span className="day-chip">
                        {bagStatusLabels[courier.bag_status] || courier.bag_status}
                      </span>
                      <BagStatusForm
                        id={courier.id}
                        currentStatus={courier.bag_status}
                        statuses={bagStatusesResult.data}
                      />
                    </div>
                  </article>
                ))
              ) : (
                <article className="user-card">
                  <div>
                    <strong>Nenhum entregador cadastrado</strong>
                    <p>Depois da carga inicial no banco, os novos cadastros passam a ser feitos por aqui.</p>
                  </div>
                </article>
              )}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
