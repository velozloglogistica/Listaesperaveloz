"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { updateBagCourierStatus } from "@/app/bag-actions";
import {
  BAG_SHIFT_LABELS,
  BAG_WEEKDAY_LABELS,
  BAG_VEHICLE_LABELS,
  type BagShift,
  type BagStatus,
  type BagVehicle,
  type BagWeekday,
} from "@/lib/bag-config";

type CourierPerformanceTier = "bom" | "regular" | "atencao" | "parado" | "sem_historico";
type RankingOrder = "melhor_pior" | "pior_melhor" | "mais_recente" | "mais_parado";
type OperationalFilter =
  | "todos"
  | "ativos_hoje"
  | "ativos_15d"
  | "sem_15d"
  | "sem_30d"
  | "nunca_rodaram"
  | "bons_candidatos"
  | "atencao";

type CourierPerformanceSummary = {
  hasPerformanceHistory: boolean;
  hasRunOnLatestDate: boolean;
  hasRunLast15Days: boolean;
  hasRunLast30Days: boolean;
  lastRunDate: string | null;
  activeDaysLast30: number;
  totalOrdersLast30: number;
  avgTsh: number | null;
  avgTshCritical: number | null;
  avgAr: number | null;
  avgCaa: number | null;
  avgOvertime: number | null;
  score: number | null;
  tier: CourierPerformanceTier;
  dominantHotZone: string | null;
  dominantShift: string | null;
  recommendation: string | null;
};

type BagCourierInsightView = {
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
  performance: CourierPerformanceSummary;
  listPerformance: CourierPerformanceSummary;
  dashboardPerformance: CourierPerformanceSummary;
  hasContextMatch: boolean;
  matchesSelectedHotZone: boolean;
  matchesSelectedTurno: boolean;
};

type BagStatusOption = {
  id: string;
  slug: string;
  label: string;
};

type CourierPanelClientProps = {
  couriers: BagCourierInsightView[];
  bagStatuses: BagStatusOption[];
  bagStatusLabels: Record<string, string>;
  availableHotZones: string[];
  initialSearch: string;
  initialBagStatus: string;
  initialHotZone: string;
  initialTurno: BagShift | "";
  initialOperationalFilter: OperationalFilter;
  initialRankingOrder: RankingOrder;
  createEnabled: boolean;
};

const PERFORMANCE_TIER_LABELS: Record<CourierPerformanceTier, string> = {
  bom: "Bom candidato",
  regular: "Operacao estavel",
  atencao: "Pedir atencao",
  parado: "Parado",
  sem_historico: "Sem historico",
};

const PERFORMANCE_TIER_CLASS_NAMES: Record<CourierPerformanceTier, string> = {
  bom: "day-chip-success",
  regular: "day-chip-info",
  atencao: "day-chip-warning",
  parado: "day-chip-danger",
  sem_historico: "day-chip-muted",
};

const OPERATIONAL_FILTER_LABELS: Record<OperationalFilter, string> = {
  todos: "Todos os entregadores",
  ativos_hoje: "Rodaram no ultimo dia",
  ativos_15d: "Rodaram nos ultimos 15 dias",
  sem_15d: "Sem rodar 15 dias",
  sem_30d: "Sem rodar 30 dias",
  nunca_rodaram: "Nunca rodaram",
  bons_candidatos: "Bons candidatos",
  atencao: "Pedem atencao",
};

const RANKING_ORDER_LABELS: Record<RankingOrder, string> = {
  melhor_pior: "Melhor para pior",
  pior_melhor: "Pior para melhor",
  mais_recente: "Rodou mais recente",
  mais_parado: "Mais parado primeiro",
};

function normalizeSearchValue(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return "Sem historico";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatShiftLabels(values: BagShift[]) {
  if (values.length === 0) {
    return "Sem turnos definidos";
  }

  return values.map((value) => BAG_SHIFT_LABELS[value]).join(" · ");
}

function formatWeekdayLabels(values: BagWeekday[]) {
  if (values.length === 0) {
    return "Sem dias definidos";
  }

  return values.map((value) => BAG_WEEKDAY_LABELS[value]).join(" · ");
}

function formatMetricLabel(value: number | null) {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(1)}%`;
}

function matchesOperationalFilter(courier: BagCourierInsightView, filter: OperationalFilter) {
  const base = courier.listPerformance;

  switch (filter) {
    case "ativos_hoje":
      return base.hasRunOnLatestDate;
    case "ativos_15d":
      return base.hasRunLast15Days;
    case "sem_15d":
      return !base.hasRunLast15Days;
    case "sem_30d":
      return !base.hasRunLast30Days;
    case "nunca_rodaram":
      return !base.hasPerformanceHistory;
    case "bons_candidatos":
      return base.tier === "bom";
    case "atencao":
      return base.tier === "atencao" || base.tier === "parado";
    case "todos":
    default:
      return true;
  }
}

function matchesCourierSearch(
  courier: BagCourierInsightView,
  searchTerm: string,
  bagStatusLabels: Record<string, string>,
) {
  if (!searchTerm) {
    return true;
  }

  const searchableContent = [
    courier.partner_delivery_id,
    courier.full_name,
    courier.phone_number,
    courier.identity_number || "",
    courier.city_name,
    courier.operator_name,
    courier.observation || "",
    courier.bag_status,
    bagStatusLabels[courier.bag_status] || "",
    BAG_VEHICLE_LABELS[courier.delivery_vehicle] || "",
    courier.regions.join(" "),
    courier.preferred_shifts.map((value) => BAG_SHIFT_LABELS[value] || value).join(" "),
    courier.preferred_weekdays.map((value) => BAG_WEEKDAY_LABELS[value] || value).join(" "),
    courier.joined_telegram_group ? "telegram sim" : "telegram nao",
    courier.performance.lastRunDate || "",
    courier.performance.dominantHotZone || "",
    courier.performance.dominantShift || "",
    PERFORMANCE_TIER_LABELS[courier.performance.tier],
    courier.performance.recommendation || "",
  ]
    .map((value) => normalizeSearchValue(value))
    .join(" ");

  return searchableContent.includes(searchTerm);
}

function getCourierPriority(courier: BagCourierInsightView): [number, number, string] {
  const priorityByTier: Record<CourierPerformanceTier, number> = {
    parado: 0,
    atencao: 1,
    sem_historico: 2,
    regular: 3,
    bom: 4,
  };

  return [
    priorityByTier[courier.listPerformance.tier],
    courier.listPerformance.lastRunDate
      ? -Number(courier.listPerformance.lastRunDate.replace(/-/g, ""))
      : Number.MAX_SAFE_INTEGER,
    courier.full_name,
  ];
}

function getContextScore(courier: BagCourierInsightView) {
  return courier.listPerformance.score ?? -1;
}

function getContextLastRunSortValue(courier: BagCourierInsightView) {
  return courier.listPerformance.lastRunDate
    ? Number(courier.listPerformance.lastRunDate.replace(/-/g, ""))
    : 0;
}

function sortCouriers(couriers: BagCourierInsightView[], order: RankingOrder) {
  return [...couriers].sort((a, b) => {
    if (order === "melhor_pior") {
      const scoreDiff = getContextScore(b) - getContextScore(a);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }
    }

    if (order === "pior_melhor") {
      const aScore = a.listPerformance.score;
      const bScore = b.listPerformance.score;

      if (aScore === null && bScore !== null) {
        return 1;
      }

      if (aScore !== null && bScore === null) {
        return -1;
      }

      if (aScore !== null && bScore !== null && aScore !== bScore) {
        return aScore - bScore;
      }
    }

    if (order === "mais_recente") {
      const dateDiff = getContextLastRunSortValue(b) - getContextLastRunSortValue(a);

      if (dateDiff !== 0) {
        return dateDiff;
      }
    }

    if (order === "mais_parado") {
      const dateDiff = getContextLastRunSortValue(a) - getContextLastRunSortValue(b);

      if (dateDiff !== 0) {
        return dateDiff;
      }
    }

    const [aTierPriority, aDatePriority, aNamePriority] = getCourierPriority(a);
    const [bTierPriority, bDatePriority, bNamePriority] = getCourierPriority(b);

    if (aTierPriority !== bTierPriority) {
      return aTierPriority - bTierPriority;
    }

    if (aDatePriority !== bDatePriority) {
      return aDatePriority - bDatePriority;
    }

    return aNamePriority.localeCompare(bNamePriority, "pt-BR");
  });
}

function updatePanelQuery(filters: {
  busca: string;
  status_bag: string;
  hotzone: string;
  turno: string;
  situacao: string;
  ordenacao: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const setParam = (key: string, value: string) => {
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  };

  setParam("busca", filters.busca);
  setParam("status_bag", filters.status_bag);
  setParam("hotzone", filters.hotzone);
  setParam("turno", filters.turno);
  setParam("situacao", filters.situacao === "todos" ? "" : filters.situacao);
  setParam("ordenacao", filters.ordenacao === "melhor_pior" ? "" : filters.ordenacao);
  window.history.replaceState({}, "", url.toString());
}

export function CourierPanelClient({
  couriers,
  bagStatuses,
  bagStatusLabels,
  availableHotZones,
  initialSearch,
  initialBagStatus,
  initialHotZone,
  initialTurno,
  initialOperationalFilter,
  initialRankingOrder,
  createEnabled,
}: CourierPanelClientProps) {
  const [search, setSearch] = useState(initialSearch);
  const [bagStatus, setBagStatus] = useState(initialBagStatus);
  const [hotZone, setHotZone] = useState(initialHotZone);
  const [turno, setTurno] = useState<BagShift | "">(initialTurno);
  const [operationalFilter, setOperationalFilter] = useState<OperationalFilter>(initialOperationalFilter);
  const [rankingOrder, setRankingOrder] = useState<RankingOrder>(initialRankingOrder);

  const searchTerm = useMemo(() => normalizeSearchValue(search), [search]);
  const contextFilterActive = Boolean(hotZone) || Boolean(turno);

  const filteredCouriers = useMemo(() => {
    const filtered = couriers.filter((courier) => {
      const matchesContextFilters =
        (!hotZone || courier.matchesSelectedHotZone) &&
        (!turno || courier.matchesSelectedTurno);
      const matchesBagStatus = !bagStatus || courier.bag_status === bagStatus;

      return (
        matchesContextFilters &&
        matchesBagStatus &&
        matchesOperationalFilter(courier, operationalFilter) &&
        matchesCourierSearch(courier, searchTerm, bagStatusLabels)
      );
    });

    return sortCouriers(filtered, rankingOrder);
  }, [bagStatus, bagStatusLabels, couriers, hotZone, operationalFilter, rankingOrder, searchTerm, turno]);

  const summaryText = searchTerm
    ? `Mostrando ${filteredCouriers.length} de ${couriers.length} entregadores para a busca atual.`
    : [
        OPERATIONAL_FILTER_LABELS[operationalFilter],
        bagStatus ? `Status BAG: ${bagStatusLabels[bagStatus] || bagStatus}` : "",
        hotZone ? `Hot Zone: ${hotZone}` : "",
        turno ? `Turno: ${BAG_SHIFT_LABELS[turno]}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

  const applyFilters = () => {
    updatePanelQuery({
      busca: search,
      status_bag: bagStatus,
      hotzone: hotZone,
      turno,
      situacao: operationalFilter,
      ordenacao: rankingOrder,
    });
  };

  const resetFilters = () => {
    setSearch("");
    setBagStatus("");
    setHotZone("");
    setTurno("");
    setOperationalFilter("todos");
    setRankingOrder("melhor_pior");
    updatePanelQuery({
      busca: "",
      status_bag: "",
      hotzone: "",
      turno: "",
      situacao: "todos",
      ordenacao: "melhor_pior",
    });
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Painel de entregadores</h2>
          <p>{summaryText}</p>
        </div>
        {createEnabled ? (
          <Link href="/informacoes-bag/novo" className="primary-button link-button">
            Novo entregador
          </Link>
        ) : null}
      </div>
      <section className="courier-filter-panel">
        <div className="courier-filter-copy">
          <strong>Busca e filtros operacionais</strong>
          <p>Filtre a base e monte a melhor shortlist por Hot Zone, turno e momento operacional.</p>
        </div>
        <div className="courier-toolbar courier-toolbar-stack">
          <div className="courier-toolbar-row courier-toolbar-row-primary">
            <input
              type="search"
              name="busca"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="text-input courier-search-input courier-filter-control"
              placeholder="Pesquisar por nome, ID, telefone, CPF, status, Hot Zone ou operador"
            />
            <select
              name="status_bag"
              value={bagStatus}
              onChange={(event) => setBagStatus(event.target.value)}
              className="select-input courier-filter-select courier-filter-control"
            >
              <option value="">Todos os status BAG</option>
              {bagStatuses.map((status) => (
                <option key={status.id} value={status.slug}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <div className="courier-toolbar-row courier-toolbar-row-secondary">
            <select
              name="hotzone"
              value={hotZone}
              onChange={(event) => setHotZone(event.target.value)}
              className="select-input courier-filter-select courier-filter-control"
            >
              <option value="">Todas as Hot Zones</option>
              {availableHotZones.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              name="turno"
              value={turno}
              onChange={(event) => setTurno(event.target.value as BagShift | "")}
              className="select-input courier-filter-select courier-filter-control"
            >
              <option value="">Todos os turnos</option>
              {(Object.keys(BAG_SHIFT_LABELS) as BagShift[]).map((shift) => (
                <option key={shift} value={shift}>
                  {BAG_SHIFT_LABELS[shift]}
                </option>
              ))}
            </select>
            <select
              name="situacao"
              value={operationalFilter}
              onChange={(event) => setOperationalFilter(event.target.value as OperationalFilter)}
              className="select-input courier-filter-select courier-filter-control"
            >
              {(Object.keys(OPERATIONAL_FILTER_LABELS) as OperationalFilter[]).map((filterKey) => (
                <option key={filterKey} value={filterKey}>
                  {OPERATIONAL_FILTER_LABELS[filterKey]}
                </option>
              ))}
            </select>
          </div>
          <div className="courier-toolbar-row courier-toolbar-row-tertiary">
            <select
              name="ordenacao"
              value={rankingOrder}
              onChange={(event) => setRankingOrder(event.target.value as RankingOrder)}
              className="select-input courier-filter-select courier-filter-control"
            >
              {(Object.keys(RANKING_ORDER_LABELS) as RankingOrder[]).map((orderKey) => (
                <option key={orderKey} value={orderKey}>
                  {RANKING_ORDER_LABELS[orderKey]}
                </option>
              ))}
            </select>
            <div className="courier-toolbar-actions">
              <button type="button" className="primary-button" onClick={applyFilters}>
                Filtrar
              </button>
              {search ||
              bagStatus ||
              operationalFilter !== "todos" ||
              hotZone ||
              turno ||
              rankingOrder !== "melhor_pior" ? (
                <button type="button" className="secondary-button courier-reset-button" onClick={resetFilters}>
                  Limpar
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="users-list">
        {filteredCouriers.length > 0 ? (
          filteredCouriers.map((courier) => (
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
                {contextFilterActive ? (
                  <p className="courier-context-note">
                    Contexto atual: {hotZone ? `Hot Zone ${hotZone}` : "todas as Hot Zones"} /{" "}
                    {turno ? BAG_SHIFT_LABELS[turno] : "todos os turnos"}
                  </p>
                ) : null}
                <div className="courier-performance-grid">
                  <span className="courier-performance-stat">
                    <strong>Ultima rodada</strong>
                    <span>{formatDateLabel(courier.listPerformance.lastRunDate)}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>Dias ativos 30d</strong>
                    <span>{courier.listPerformance.activeDaysLast30}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>Pedidos 30d</strong>
                    <span>{courier.listPerformance.totalOrdersLast30}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>TSH</strong>
                    <span>{formatMetricLabel(courier.listPerformance.avgTsh)}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>AR</strong>
                    <span>{formatMetricLabel(courier.listPerformance.avgAr)}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>CAA</strong>
                    <span>{formatMetricLabel(courier.listPerformance.avgCaa)}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>Overtime</strong>
                    <span>{formatMetricLabel(courier.listPerformance.avgOvertime)}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>TSH critico</strong>
                    <span>{formatMetricLabel(courier.listPerformance.avgTshCritical)}</span>
                  </span>
                </div>
                <p className="courier-highlight">
                  <strong>Melhor encaixe:</strong> {courier.listPerformance.recommendation}
                </p>
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
                <span className={`day-chip ${PERFORMANCE_TIER_CLASS_NAMES[courier.listPerformance.tier]}`}>
                  {PERFORMANCE_TIER_LABELS[courier.listPerformance.tier]}
                </span>
                <span className="day-chip">{bagStatusLabels[courier.bag_status] || courier.bag_status}</span>
                <form action={updateBagCourierStatus} className="status-form">
                  <input type="hidden" name="id" value={courier.id} />
                  <select
                    name="bag_status"
                    defaultValue={courier.bag_status}
                    aria-label="Atualizar status do BAG"
                    className="select-input"
                  >
                    {bagStatuses.map((option) => (
                      <option key={option.slug} value={option.slug}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="secondary-button">
                    Salvar
                  </button>
                </form>
              </div>
            </article>
          ))
        ) : couriers.length > 0 ? (
          <article className="user-card">
            <div>
              <strong>Nenhum entregador encontrado</strong>
              <p>
                Altere a busca ou o filtro para localizar por nome, ID, telefone, CPF, status, Hot Zone, operador ou
                situacao operacional.
              </p>
            </div>
          </article>
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
  );
}
