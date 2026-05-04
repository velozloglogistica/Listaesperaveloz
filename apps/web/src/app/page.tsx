import { GroupedBoard } from "@/components/grouped-board";
import { LogoutForm } from "@/components/logout-form";
import { ManualWaitlistForm } from "@/components/manual-waitlist-form";
import { RequestsTable } from "@/components/requests-table";
import { SummaryCard } from "@/components/summary-card";
import { UserManagementForm } from "@/components/user-management-form";
import { requireWaitlistAccess } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import type { PageFilters, WaitlistRequest } from "@/lib/types";
import { HORARIOS, PRACAS } from "@/lib/waitlist-constants";

export const dynamic = "force-dynamic";

function firstParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function currentOperationalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Manaus",
  }).format(new Date());
}

function buildSearchOrClause(search: string) {
  const sanitized = search.replace(/,/g, " ").trim();
  return `nome.ilike.%${sanitized}%,cpf.ilike.%${sanitized}%,telefone.ilike.%${sanitized}%`;
}

async function getRequests(filters: PageFilters) {
  let query = supabaseServer
    .from("waitlist_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.date ? 1000 : 500);

  if (filters.praca) {
    query = query.eq("praca", filters.praca);
  }

  if (filters.horario) {
    query = query.eq("horario_label", filters.horario);
  }

  if (filters.search) {
    query = query.or(buildSearchOrClause(filters.search));
  }

  if (filters.date) {
    query = query.eq("escala_data", filters.date);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const requests = (data || []) as WaitlistRequest[];
  return requests;
}

function getSummary(requests: WaitlistRequest[]) {
  const total = requests.length;
  const pendentes = requests.filter((item) => item.status === "pendente").length;
  const agendados = requests.filter((item) => item.status === "agendado").length;
  const usados = requests.filter((item) => item.is_used).length;
  const disponiveis = total - usados;

  const byPraca = requests.reduce<Record<string, number>>((acc, item) => {
    acc[item.praca] = (acc[item.praca] || 0) + 1;
    return acc;
  }, {});

  const mostActivePraca =
    Object.entries(byPraca).sort((a, b) => b[1] - a[1])[0]?.join(": ") || "Sem dados";

  return { total, pendentes, agendados, usados, disponiveis, mostActivePraca };
}

async function getAppUsers() {
  const { data, error } = await supabaseServer
    .from("app_users")
    .select("id,full_name,email,role,can_access_waitlist,is_active,created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = (await searchParams) || {};
  const defaultDate = currentOperationalDate();
  const rawDateParam = resolvedParams.date;
  const filters: PageFilters = {
    search: firstParam(resolvedParams.search),
    praca: firstParam(resolvedParams.praca),
    horario: firstParam(resolvedParams.horario),
    date: rawDateParam === undefined ? defaultDate : firstParam(rawDateParam),
  };

  const currentUser = await requireWaitlistAccess();
  const requests = await getRequests(filters);
  const summary = getSummary(requests);
  const appUsers = currentUser.role === "owner" ? await getAppUsers() : [];

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-topbar">
          <div>
            <p className="eyebrow">VelozLog</p>
            <h1>Lista de espera</h1>
            <p className="hero-copy">
              Painel para acompanhar as solicitações recebidas pelo bot do Telegram.
            </p>
          </div>
          <div className="hero-userbox">
            <div>
              <strong>{currentUser.full_name}</strong>
              <p>
                {currentUser.email} · {currentUser.role === "owner" ? "Owner" : "Area"}
              </p>
            </div>
            <LogoutForm />
          </div>
        </div>
      </section>

      {currentUser.role === "owner" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Acessos do painel</h2>
              <p>O owner cria logins e define quem pode acessar o modulo da lista de espera.</p>
            </div>
          </div>

          <UserManagementForm />

          <div className="users-list">
            {appUsers.map((user) => (
              <article key={user.id} className="user-card">
                <div>
                  <strong>{user.full_name}</strong>
                  <p>{user.email}</p>
                </div>
                <div className="user-card-meta">
                  <span className="day-chip">{user.role === "owner" ? "Owner" : "Area"}</span>
                  <span className="request-time">
                    {user.can_access_waitlist ? "Lista ativa" : "Sem modulo"}
                  </span>
                  <span className="request-time">{user.is_active ? "Ativo" : "Inativo"}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="summary-grid">
        <SummaryCard title="Total exibido" value={summary.total} />
        <SummaryCard title="Disponíveis" value={summary.disponiveis} />
        <SummaryCard title="Pendentes" value={summary.pendentes} />
        <SummaryCard title="Agendados" value={summary.agendados} />
        <SummaryCard title="Usados" value={summary.usados} subtitle={summary.mostActivePraca} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Adicionar manualmente</h2>
            <p>Permite cadastrar qualquer nome, turno e data direto pelo operacional.</p>
          </div>
        </div>
        <ManualWaitlistForm defaultDate={filters.date || defaultDate} />
      </section>

      <section className="panel">
        <form className="filters-grid" method="get">
          <input
            className="text-input"
            type="search"
            name="search"
            placeholder="Buscar por nome, CPF ou telefone"
            defaultValue={filters.search}
          />

          <select className="select-input" name="praca" defaultValue={filters.praca}>
            <option value="">Todas as praças</option>
            {PRACAS.map((praca) => (
              <option key={praca} value={praca}>
                {praca}
              </option>
            ))}
          </select>

          <select className="select-input" name="horario" defaultValue={filters.horario}>
            <option value="">Todos os horários</option>
            {Object.keys(HORARIOS).map((horario) => (
              <option key={horario} value={horario}>
                {horario}
              </option>
            ))}
          </select>

          <input className="text-input" type="date" name="date" defaultValue={filters.date} />

          <div className="filters-actions">
            <button type="submit" className="primary-button">
              Filtrar
            </button>
            <a href="/" className="secondary-button link-button">
              Limpar
            </a>
          </div>
        </form>
        <div className="panel-header">
          <p>O filtro de data usa a data real da escala salva em `escala_data`.</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Fila operacional</h2>
          <p>Veja todos os horários e hotzones sem precisar caçar nomes na tela</p>
        </div>
        <GroupedBoard requests={requests} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Solicitações</h2>
          <p>{requests.length} registro(s)</p>
        </div>
        <RequestsTable requests={requests} />
      </section>
    </main>
  );
}
