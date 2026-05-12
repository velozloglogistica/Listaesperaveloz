import { AppShell } from "@/components/app-shell";
import { BagCityForm } from "@/components/bag-city-form";
import { BagRegionForm } from "@/components/bag-region-form";
import { CompanyProfileForm } from "@/components/company-profile-form";
import { SummaryCard } from "@/components/summary-card";
import { requireSettingsAccess } from "@/lib/auth";
import { isCompanyAccessSchemaMissing } from "@/lib/company-access";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type TenantCityView = {
  id: string;
  name: string;
  is_active: boolean;
};

type TenantHotZoneView = {
  id: string;
  name: string;
  city_id: string;
  city_name: string;
};

async function getTenantSettings(tenantId: string) {
  const { data, error } = await supabaseServer
    .from("tenant_settings")
    .select("westwind_login,westwind_password")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return {
        foundationReady: false,
        data: {
          westwind_login: "",
          westwind_password: "",
        },
      };
    }

    throw new Error(error.message);
  }

  return {
    foundationReady: true,
    data: {
      westwind_login: data?.westwind_login || "",
      westwind_password: data?.westwind_password || "",
    },
  };
}

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

async function getTenantHotZones(
  tenantId: string,
): Promise<{ foundationReady: boolean; data: TenantHotZoneView[] }> {
  const { data, error } = await supabaseServer
    .from("tenant_regions")
    .select("id,name,city_id,tenant_cities!inner(name)")
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
        },
      ];
    }),
  };
}

export default async function PerfilEmpresaPage() {
  const currentUser = await requireSettingsAccess();
  const tenantId = currentUser.current_tenant.id;

  const [settingsResult, citiesResult, hotZonesResult] = await Promise.all([
    getTenantSettings(tenantId),
    getTenantCities(tenantId),
    getTenantHotZones(tenantId),
  ]);

  const foundationReady =
    settingsResult.foundationReady && citiesResult.foundationReady && hotZonesResult.foundationReady;

  return (
    <AppShell
      currentPath="/perfil-empresa"
      title="Perfil da empresa"
      description="Configure credenciais da West Wind, cidades atendidas e Hot Zones da empresa atual."
      user={currentUser}
    >
      {!foundationReady ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Ativar perfil da empresa</h2>
              <p>
                Rode a migration `supabase/add_bag_information_module.sql` para liberar credenciais,
                cidades e Hot Zones por tenant.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="summary-grid">
            <SummaryCard title="Cidades" value={citiesResult.data.length} />
            <SummaryCard title="Hot Zones" value={hotZonesResult.data.length} />
            <SummaryCard
              title="West Wind"
              value={settingsResult.data.westwind_login ? "Configurado" : "Pendente"}
            />
            <SummaryCard title="Empresa atual" value={currentUser.current_tenant.name} />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Credenciais da West Wind</h2>
                <p>Salve aqui o login e a senha usados pela empresa para operar na West Wind.</p>
              </div>
            </div>
            <CompanyProfileForm initialValues={settingsResult.data} />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Cidades e Hot Zones</h2>
                <p>Essas configuracoes alimentam o cadastro operacional do modulo Informacoes de BAG.</p>
              </div>
            </div>

            <div className="access-grid">
              <div className="access-panel">
                <h3>Nova cidade</h3>
                <p>Cadastre as cidades atendidas pela empresa atual.</p>
                <BagCityForm />
              </div>

              <div className="access-panel">
                <h3>Nova Hot Zone</h3>
                <p>As Hot Zones ficam vinculadas a uma cidade ja cadastrada.</p>
                {citiesResult.data.length > 0 ? (
                  <BagRegionForm cities={citiesResult.data} />
                ) : (
                  <div className="platform-note">
                    <p>Cadastre pelo menos uma cidade antes de criar Hot Zones.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="users-list">
              {citiesResult.data.map((city) => {
                const cityHotZones = hotZonesResult.data.filter((item) => item.city_id === city.id);

                return (
                  <article key={city.id} className="user-card user-card-stack">
                    <div>
                      <strong>{city.name}</strong>
                      <p>
                        Hot Zones:{" "}
                        {cityHotZones.map((item) => item.name).join(" · ") || "Nenhuma Hot Zone ainda"}
                      </p>
                    </div>
                    <div className="user-card-meta">
                      <span className="day-chip">{city.is_active ? "Ativa" : "Inativa"}</span>
                      <span className="request-time">{cityHotZones.length} Hot Zone(s)</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
