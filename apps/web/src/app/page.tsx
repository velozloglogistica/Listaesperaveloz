import { GroupedBoard } from "@/components/grouped-board";
import { RequestsTable } from "@/components/requests-table";
import { SummaryCard } from "@/components/summary-card";
import { supabaseServer } from "@/lib/supabase-server";
import type { PageFilters, WaitlistRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

const pracas = ["Chapada", "Ponta Negra", "Santa Etelvina", "Tancredo Neves"];
const horarios = ["Almoço", "Merenda", "Jantar"];
const statuses = ["pendente", "agendado", "recusado", "cancelado"];

function firstParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function getManausDateParts(dateInput: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "America/Manaus",
  }).formatToParts(new Date(dateInput));

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
  };
}

function formatUtcDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function currentOperationalDate() {
  const parts = getManausDateParts(new Date());
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getOperationalDate(request: WaitlistRequest) {
  const parts = getManausDateParts(request.created_at);
  const baseDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  if (request.escala_dia_label === "Hoje") {
    return formatUtcDate(baseDate);
  }

  const targetWeekdayMap: Record<string, number> = {
    Domingo: 0,
    Sexta: 5,
    "Sábado": 6,
  };

  const targetWeekday = targetWeekdayMap[request.escala_dia_label];
  if (targetWeekday === undefined) {
    return formatUtcDate(baseDate);
  }

  const result = new Date(baseDate);
  while (result.getUTCDay() !== targetWeekday) {
    result.setUTCDate(result.getUTCDate() + 1);
  }

  return formatUtcDate(result);
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

  if (filters.search) {
    query = query.or(buildSearchOrClause(filters.search));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const requests = (data || []) as WaitlistRequest[];

  if (!filters.date) {
    return requests;
  }

  return requests.filter((request) => getOperationalDate(request) === filters.date);
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
  const defaultDate = currentOperationalDate();
  const filters: PageFilters = {
    search: firstParam(resolvedParams.search),
    praca: firstParam(resolvedParams.praca),
    horario: firstParam(resolvedParams.horario),
    status: firstParam(resolvedParams.status),
    date: firstParam(resolvedParams.date) || defaultDate,
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

          <select className="select-input" name="status" defaultValue={filters.status}>
            <option value="">Todos os status</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
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
