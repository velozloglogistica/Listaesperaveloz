import { GroupedBoard } from "@/components/grouped-board";
import { RequestsTable } from "@/components/requests-table";
import { SummaryCard } from "@/components/summary-card";
import { supabaseServer } from "@/lib/supabase-server";
import type { PageFilters, WaitlistRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

const pracas = ["Chapada", "Ponta Negra", "Santa Etelvina", "Tancredo Neves"];
const horarios = ["Almoço", "Merenda", "Jantar"];
const dias = ["Hoje", "Sexta", "Sábado", "Domingo"];
const statuses = ["pendente", "agendado", "recusado", "cancelado"];
const usages = [
  { value: "", label: "Todos" },
  { value: "available", label: "Disponíveis" },
  { value: "used", label: "Usados" },
];

function firstParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function startOfDayIso(dateString: string) {
  return `${dateString}T00:00:00.000-04:00`;
}

function endOfDayIso(dateString: string) {
  return `${dateString}T23:59:59.999-04:00`;
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
    .limit(200);

  if (filters.praca) {
    query = query.eq("praca", filters.praca);
  }

  if (filters.horario) {
    query = query.eq("horario_label", filters.horario);
  }

  if (filters.day) {
    query = query.eq("escala_dia_label", filters.day);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.usage === "available") {
    query = query.or("is_used.is.null,is_used.eq.false");
  }

  if (filters.usage === "used") {
    query = query.eq("is_used", true);
  }

  if (filters.date) {
    query = query
      .gte("created_at", startOfDayIso(filters.date))
      .lte("created_at", endOfDayIso(filters.date));
  }

  if (filters.search) {
    query = query.or(buildSearchOrClause(filters.search));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as WaitlistRequest[];
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

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = (await searchParams) || {};
  const filters: PageFilters = {
    search: firstParam(resolvedParams.search),
    praca: firstParam(resolvedParams.praca),
    horario: firstParam(resolvedParams.horario),
    status: firstParam(resolvedParams.status),
    day: firstParam(resolvedParams.day),
    date: firstParam(resolvedParams.date),
    usage: firstParam(resolvedParams.usage),
  };

  const requests = await getRequests(filters);
  const summary = getSummary(requests);

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">VelozLog</p>
          <h1>Lista de espera</h1>
          <p className="hero-copy">
            Painel para acompanhar as solicitações recebidas pelo bot do Telegram.
          </p>
        </div>
      </section>

      <section className="summary-grid">
        <SummaryCard title="Total exibido" value={summary.total} />
        <SummaryCard title="Disponíveis" value={summary.disponiveis} />
        <SummaryCard title="Pendentes" value={summary.pendentes} />
        <SummaryCard title="Agendados" value={summary.agendados} />
        <SummaryCard title="Usados" value={summary.usados} subtitle={summary.mostActivePraca} />
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
            {pracas.map((praca) => (
              <option key={praca} value={praca}>
                {praca}
              </option>
            ))}
          </select>

          <select className="select-input" name="horario" defaultValue={filters.horario}>
            <option value="">Todos os horários</option>
            {horarios.map((horario) => (
              <option key={horario} value={horario}>
                {horario}
              </option>
            ))}
          </select>

          <select className="select-input" name="day" defaultValue={filters.day}>
            <option value="">Todos os dias</option>
            {dias.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>

          <select className="select-input" name="status" defaultValue={filters.status}>
            <option value="">Todos os status</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select className="select-input" name="usage" defaultValue={filters.usage}>
            {usages.map((usage) => (
              <option key={usage.label} value={usage.value}>
                {usage.label}
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
