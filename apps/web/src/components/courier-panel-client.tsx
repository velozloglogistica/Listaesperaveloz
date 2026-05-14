"use client";

import { useEffect, useMemo, useState } from "react";
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

type CourierContextPerformanceEntry = {
  kind: "hotzone" | "turno" | "pair";
  hotZone: string | null;
  turno: BagShift | null;
  summary: CourierPerformanceSummary;
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
  contextPerformances: CourierContextPerformanceEntry[];
};

type FilteredCourierView = BagCourierInsightView & {
  activePerformance: CourierPerformanceSummary;
};

type BagStatusOption = {
  id: string;
  slug: string;
  label: string;
};

type PanelFilters = {
  search: string;
  bagStatus: string;
  hotZone: string;
  turno: BagShift | "";
  operationalFilter: OperationalFilter;
  rankingOrder: RankingOrder;
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

const COURIERS_PAGE_SIZE = 30;

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

function matchesOperationalFilter(base: CourierPerformanceSummary, filter: OperationalFilter) {
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

function matchesSelectedHotZone(courier: BagCourierInsightView, hotZone: string) {
  const normalizedHotZone = normalizeSearchValue(hotZone);

  if (!normalizedHotZone) {
    return true;
  }

  return (
    courier.regions.some((region) => normalizeSearchValue(region) === normalizedHotZone) ||
    courier.contextPerformances.some(
      (entry) => entry.hotZone && normalizeSearchValue(entry.hotZone) === normalizedHotZone,
    )
  );
}

function matchesSelectedTurno(courier: BagCourierInsightView, turno: BagShift | "") {
  if (!turno) {
    return true;
  }

  return (
    courier.preferred_shifts.includes(turno) ||
    courier.contextPerformances.some((entry) => entry.turno === turno)
  );
}

function getAppliedContextSummary(
  courier: BagCourierInsightView,
  filters: Pick<PanelFilters, "hotZone" | "turno">,
): CourierPerformanceSummary {
  if (!filters.hotZone && !filters.turno) {
    return courier.listPerformance;
  }

  const normalizedHotZone = normalizeSearchValue(filters.hotZone);

  const matchedEntry =
    courier.contextPerformances.find(
      (entry) =>
        entry.kind === "pair" &&
        entry.turno === filters.turno &&
        normalizeSearchValue(entry.hotZone) === normalizedHotZone,
    ) ||
    courier.contextPerformances.find(
      (entry) =>
        entry.kind === "hotzone" &&
        !filters.turno &&
        normalizeSearchValue(entry.hotZone) === normalizedHotZone,
    ) ||
    courier.contextPerformances.find(
      (entry) => entry.kind === "turno" && !filters.hotZone && entry.turno === filters.turno,
    );

  if (matchedEntry) {
    return matchedEntry.summary;
  }

  return {
    hasPerformanceHistory: false,
    hasRunOnLatestDate: false,
    hasRunLast15Days: false,
    hasRunLast30Days: false,
    lastRunDate: null,
    activeDaysLast30: 0,
    totalOrdersLast30: 0,
    avgTsh: null,
    avgTshCritical: null,
    avgAr: null,
    avgCaa: null,
    avgOvertime: null,
    score: null,
    tier: "sem_historico",
    dominantHotZone: filters.hotZone || null,
    dominantShift: filters.turno ? BAG_SHIFT_LABELS[filters.turno] : null,
    recommendation: "Sem historico recente nesse contexto filtrado.",
  };
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

function getCourierPriority(courier: FilteredCourierView): [number, number, string] {
  const priorityByTier: Record<CourierPerformanceTier, number> = {
    parado: 0,
    atencao: 1,
    sem_historico: 2,
    regular: 3,
    bom: 4,
  };

  return [
    priorityByTier[courier.activePerformance.tier],
    courier.activePerformance.lastRunDate
      ? -Number(courier.activePerformance.lastRunDate.replace(/-/g, ""))
      : Number.MAX_SAFE_INTEGER,
    courier.full_name,
  ];
}

function getContextScore(courier: FilteredCourierView) {
  return courier.activePerformance.score ?? -1;
}

function getContextLastRunSortValue(courier: FilteredCourierView) {
  return courier.activePerformance.lastRunDate
    ? Number(courier.activePerformance.lastRunDate.replace(/-/g, ""))
    : 0;
}

function sortCouriers(couriers: FilteredCourierView[], order: RankingOrder) {
  return [...couriers].sort((a, b) => {
    if (order === "melhor_pior") {
      const scoreDiff = getContextScore(b) - getContextScore(a);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }
    }

    if (order === "pior_melhor") {
      const aScore = a.activePerformance.score;
      const bScore = b.activePerformance.score;

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
  const initialFilters = useMemo<PanelFilters>(
    () => ({
      search: initialSearch,
      bagStatus: initialBagStatus,
      hotZone: initialHotZone,
      turno: initialTurno,
      operationalFilter: initialOperationalFilter,
      rankingOrder: initialRankingOrder,
    }),
    [
      initialBagStatus,
      initialHotZone,
      initialOperationalFilter,
      initialRankingOrder,
      initialSearch,
      initialTurno,
    ],
  );
  const defaultFilters = useMemo<PanelFilters>(
    () => ({
      search: "",
      bagStatus: "",
      hotZone: "",
      turno: "",
      operationalFilter: "todos",
      rankingOrder: "melhor_pior",
    }),
    [],
  );

  const [draftFilters, setDraftFilters] = useState<PanelFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<PanelFilters>(initialFilters);
  const [visibleCount, setVisibleCount] = useState(COURIERS_PAGE_SIZE);
  const [isApplyingFilters, setIsApplyingFilters] = useState(false);

  const searchTerm = useMemo(
    () => normalizeSearchValue(appliedFilters.search),
    [appliedFilters.search],
  );
  const contextFilterActive = Boolean(appliedFilters.hotZone) || Boolean(appliedFilters.turno);
  const hasPendingChanges =
    draftFilters.search !== appliedFilters.search ||
    draftFilters.bagStatus !== appliedFilters.bagStatus ||
    draftFilters.hotZone !== appliedFilters.hotZone ||
    draftFilters.turno !== appliedFilters.turno ||
    draftFilters.operationalFilter !== appliedFilters.operationalFilter ||
    draftFilters.rankingOrder !== appliedFilters.rankingOrder;

  const filteredCouriers = useMemo(() => {
    const filtered = couriers.flatMap<FilteredCourierView>((courier) => {
      const matchesContextFilters =
        matchesSelectedHotZone(courier, appliedFilters.hotZone) &&
        matchesSelectedTurno(courier, appliedFilters.turno);
      const matchesBagStatus =
        !appliedFilters.bagStatus || courier.bag_status === appliedFilters.bagStatus;
      const activePerformance = getAppliedContextSummary(courier, appliedFilters);

      if (
        !matchesContextFilters ||
        !matchesBagStatus ||
        !matchesOperationalFilter(activePerformance, appliedFilters.operationalFilter) ||
        !matchesCourierSearch(courier, searchTerm, bagStatusLabels)
      ) {
        return [];
      }

      return [{ ...courier, activePerformance }];
    });

    return sortCouriers(filtered, appliedFilters.rankingOrder);
  }, [appliedFilters, bagStatusLabels, couriers, searchTerm]);

  useEffect(() => {
    setVisibleCount(COURIERS_PAGE_SIZE);
  }, [appliedFilters]);

  const visibleCouriers = useMemo(
    () => filteredCouriers.slice(0, visibleCount),
    [filteredCouriers, visibleCount],
  );
  const hasMoreCouriers = visibleCouriers.length < filteredCouriers.length;
  const remainingCouriers = Math.max(filteredCouriers.length - visibleCouriers.length, 0);

  const summaryText = searchTerm
    ? `Mostrando ${filteredCouriers.length} de ${couriers.length} entregadores para a busca atual.`
    : [
        OPERATIONAL_FILTER_LABELS[appliedFilters.operationalFilter],
        appliedFilters.bagStatus
          ? `Status BAG: ${bagStatusLabels[appliedFilters.bagStatus] || appliedFilters.bagStatus}`
          : "",
        appliedFilters.hotZone ? `Hot Zone: ${appliedFilters.hotZone}` : "",
        appliedFilters.turno ? `Turno: ${BAG_SHIFT_LABELS[appliedFilters.turno]}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

  const applyFilters = () => {
    if (!hasPendingChanges) {
      return;
    }

    setIsApplyingFilters(true);

    window.setTimeout(() => {
      setAppliedFilters(draftFilters);
      setVisibleCount(COURIERS_PAGE_SIZE);
      updatePanelQuery({
        busca: draftFilters.search,
        status_bag: draftFilters.bagStatus,
        hotzone: draftFilters.hotZone,
        turno: draftFilters.turno,
        situacao: draftFilters.operationalFilter,
        ordenacao: draftFilters.rankingOrder,
      });
      setIsApplyingFilters(false);
    }, 120);
  };

  const resetFilters = () => {
    setIsApplyingFilters(true);

    window.setTimeout(() => {
      setDraftFilters(defaultFilters);
      setAppliedFilters(defaultFilters);
      setVisibleCount(COURIERS_PAGE_SIZE);
      updatePanelQuery({
        busca: "",
        status_bag: "",
        hotzone: "",
        turno: "",
        situacao: "todos",
        ordenacao: "melhor_pior",
      });
      setIsApplyingFilters(false);
    }, 120);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Painel de entregadores</h2>
          <p>{summaryText}</p>
          {isApplyingFilters ? <span className="courier-filter-status">Aplicando filtros...</span> : null}
          {!isApplyingFilters && hasPendingChanges ? (
            <span className="courier-filter-status courier-filter-status-pending">
              Existem alteracoes nao aplicadas.
            </span>
          ) : null}
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
              value={draftFilters.search}
              onChange={(event) =>
                setDraftFilters((currentValue) => ({
                  ...currentValue,
                  search: event.target.value,
                }))
              }
              className="text-input courier-search-input courier-filter-control"
              placeholder="Pesquisar por nome, ID, telefone, CPF, status, Hot Zone ou operador"
            />
            <select
              name="status_bag"
              value={draftFilters.bagStatus}
              onChange={(event) =>
                setDraftFilters((currentValue) => ({
                  ...currentValue,
                  bagStatus: event.target.value,
                }))
              }
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
              value={draftFilters.hotZone}
              onChange={(event) =>
                setDraftFilters((currentValue) => ({
                  ...currentValue,
                  hotZone: event.target.value,
                }))
              }
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
              value={draftFilters.turno}
              onChange={(event) =>
                setDraftFilters((currentValue) => ({
                  ...currentValue,
                  turno: event.target.value as BagShift | "",
                }))
              }
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
              value={draftFilters.operationalFilter}
              onChange={(event) =>
                setDraftFilters((currentValue) => ({
                  ...currentValue,
                  operationalFilter: event.target.value as OperationalFilter,
                }))
              }
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
              value={draftFilters.rankingOrder}
              onChange={(event) =>
                setDraftFilters((currentValue) => ({
                  ...currentValue,
                  rankingOrder: event.target.value as RankingOrder,
                }))
              }
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
                {isApplyingFilters ? "Carregando..." : "Filtrar"}
              </button>
              {draftFilters.search ||
              draftFilters.bagStatus ||
              draftFilters.operationalFilter !== "todos" ||
              draftFilters.hotZone ||
              draftFilters.turno ||
              draftFilters.rankingOrder !== "melhor_pior" ? (
                <button type="button" className="secondary-button courier-reset-button" onClick={resetFilters}>
                  {isApplyingFilters ? "Limpando..." : "Limpar filtros"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="users-list">
        {filteredCouriers.length > 0 ? (
          visibleCouriers.map((courier) => (
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
                    Contexto atual:{" "}
                    {appliedFilters.hotZone
                      ? `Hot Zone ${appliedFilters.hotZone}`
                      : "todas as Hot Zones"}{" "}
                    /{" "}
                    {appliedFilters.turno
                      ? BAG_SHIFT_LABELS[appliedFilters.turno]
                      : "todos os turnos"}
                  </p>
                ) : null}
                <div className="courier-performance-grid">
                  <span className="courier-performance-stat">
                    <strong>Ultima rodada</strong>
                    <span>{formatDateLabel(courier.activePerformance.lastRunDate)}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>Dias ativos 30d</strong>
                    <span>{courier.activePerformance.activeDaysLast30}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>Pedidos 30d</strong>
                    <span>{courier.activePerformance.totalOrdersLast30}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>TSH</strong>
                    <span>{formatMetricLabel(courier.activePerformance.avgTsh)}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>AR</strong>
                    <span>{formatMetricLabel(courier.activePerformance.avgAr)}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>CAA</strong>
                    <span>{formatMetricLabel(courier.activePerformance.avgCaa)}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>Overtime</strong>
                    <span>{formatMetricLabel(courier.activePerformance.avgOvertime)}</span>
                  </span>
                  <span className="courier-performance-stat">
                    <strong>TSH critico</strong>
                    <span>{formatMetricLabel(courier.activePerformance.avgTshCritical)}</span>
                  </span>
                </div>
                <p className="courier-highlight">
                  <strong>Melhor encaixe:</strong> {courier.activePerformance.recommendation}
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
                <span className={`day-chip ${PERFORMANCE_TIER_CLASS_NAMES[courier.activePerformance.tier]}`}>
                  {PERFORMANCE_TIER_LABELS[courier.activePerformance.tier]}
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

      {hasMoreCouriers ? (
        <div className="courier-load-more">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setVisibleCount((currentValue) => currentValue + COURIERS_PAGE_SIZE)}
          >
            Ver mais {Math.min(COURIERS_PAGE_SIZE, remainingCouriers)} entregadores
          </button>
          <span>
            Mostrando {visibleCouriers.length} de {filteredCouriers.length}.
          </span>
        </div>
      ) : filteredCouriers.length > COURIERS_PAGE_SIZE ? (
        <div className="courier-load-more">
          <span>
            Mostrando {filteredCouriers.length} de {filteredCouriers.length}.
          </span>
        </div>
      ) : null}
    </section>
  );
}
