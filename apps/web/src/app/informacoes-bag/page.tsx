import { redirect } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { BagStatusForm } from "@/components/bag-status-form";
import { TrendChartPanel } from "@/components/trend-chart-panel";
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

type DailyPerformanceRow = {
  data: string;
  id_entregador: string | null;
  cpf_entregador: string | null;
  nome_entregador: string | null;
  numero_telefone: string | null;
  cidade: string | null;
  pedidos_finalizados: number | null;
  tsh: number | null;
  tsh_critico: number | null;
  ar: number | null;
  caa: number | null;
  overtime: number | null;
};

type ShiftPerformanceRow = {
  data: string;
  periodo_turno: string | null;
  hot_zone: string | null;
  id_entregador: string | null;
  cpf_entregador: string | null;
  nome_entregador: string | null;
  numero_telefone: string | null;
  cidade: string | null;
  pedidos_finalizados: number | null;
  horas_reais_conectado_horarios: number | null;
  duracao_total_horarios_agendados: number | null;
  tsh: number | null;
  ar: number | null;
  caa: number | null;
  overtime: number | null;
};

type PerformanceIndex<T> = {
  byId: Map<string, T[]>;
  byCpf: Map<string, T[]>;
  byPhone: Map<string, T[]>;
};

type CourierPerformanceTier = "bom" | "regular" | "atencao" | "parado" | "sem_historico";

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

type TrendPoint = {
  date: string;
  label: string;
  value: number;
};

type RankingOrder = "melhor_pior" | "pior_melhor" | "mais_recente" | "mais_parado";

type BagCourierInsightView = BagCourierView & {
  performance: CourierPerformanceSummary;
  listPerformance: CourierPerformanceSummary;
  hasContextMatch: boolean;
  matchesSelectedHotZone: boolean;
  matchesSelectedTurno: boolean;
};

type OperationalFilter =
  | "todos"
  | "ativos_hoje"
  | "ativos_15d"
  | "sem_15d"
  | "sem_30d"
  | "nunca_rodaram"
  | "bons_candidatos"
  | "atencao";

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

const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllTenantRows<T>(
  table: string,
  columns: string,
  tenantId: string,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select(columns)
      .eq("tenant_id", tenantId)
      .order("data", { ascending: false })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data || []) as T[];
    rows.push(...batch);

    if (batch.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
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

async function getDailyPerformanceRows(tenantId: string): Promise<DailyPerformanceRow[]> {
  return fetchAllTenantRows<DailyPerformanceRow>(
    "performance_por_entregador_diario",
    "data,id_entregador,cpf_entregador,nome_entregador,numero_telefone,cidade,pedidos_finalizados,tsh,tsh_critico,ar,caa,overtime",
    tenantId,
  );
}

async function getShiftPerformanceRows(tenantId: string): Promise<ShiftPerformanceRow[]> {
  return fetchAllTenantRows<ShiftPerformanceRow>(
    "performance_por_turno_diario",
    "data,periodo_turno,hot_zone,id_entregador,cpf_entregador,nome_entregador,numero_telefone,cidade,pedidos_finalizados,horas_reais_conectado_horarios,duracao_total_horarios_agendados,tsh,ar,caa,overtime",
    tenantId,
  );
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

function normalizeSearchValue(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeCodeValue(value: string | null | undefined) {
  return normalizeSearchValue(value).replace(/\s+/g, "");
}

function normalizeDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
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

function subtractDaysFromIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function parseNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseLocalizedMetric(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const withoutPercent = value.replace(/%/g, "").trim();
  const sanitized = withoutPercent.includes(",")
    ? withoutPercent.replace(/\./g, "").replace(",", ".")
    : withoutPercent;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePercentMetric(value: unknown) {
  const parsed = parseLocalizedMetric(value);

  if (parsed === null) {
    return null;
  }

  const scaled = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, scaled));
}

function averageNumbers(values: Array<number | null>) {
  const validValues = values.filter((value): value is number => value !== null);

  if (validValues.length === 0) {
    return null;
  }

  const total = validValues.reduce((acc, value) => acc + value, 0);
  return total / validValues.length;
}

function sumNumbers(values: Array<number | null>) {
  return values.reduce<number>((acc, value) => acc + (value || 0), 0);
}

function buildPerformanceIndex<
  T extends { id_entregador: string | null; cpf_entregador: string | null; numero_telefone: string | null },
>(rows: T[]): PerformanceIndex<T> {
  const index: PerformanceIndex<T> = {
    byId: new Map<string, T[]>(),
    byCpf: new Map<string, T[]>(),
    byPhone: new Map<string, T[]>(),
  };

  for (const row of rows) {
    const idKey = normalizeCodeValue(row.id_entregador);
    const cpfKey = normalizeDigits(row.cpf_entregador);
    const phoneKey = normalizeDigits(row.numero_telefone);

    if (idKey) {
      index.byId.set(idKey, [...(index.byId.get(idKey) || []), row]);
    }

    if (cpfKey) {
      index.byCpf.set(cpfKey, [...(index.byCpf.get(cpfKey) || []), row]);
    }

    if (phoneKey) {
      index.byPhone.set(phoneKey, [...(index.byPhone.get(phoneKey) || []), row]);
    }
  }

  return index;
}

function getMatchedPerformanceRows<
  T extends { id_entregador: string | null; cpf_entregador: string | null; numero_telefone: string | null },
>(
  courier: BagCourierView,
  index: PerformanceIndex<T>,
  createRowKey: (row: T) => string,
) {
  const matchedRows = new Map<string, T>();
  const courierId = normalizeCodeValue(courier.partner_delivery_id);
  const courierCpf = normalizeDigits(courier.identity_number);
  const courierPhone = normalizeDigits(courier.phone_number);

  const sources = [
    courierId ? index.byId.get(courierId) || [] : [],
    courierCpf ? index.byCpf.get(courierCpf) || [] : [],
    courierPhone ? index.byPhone.get(courierPhone) || [] : [],
  ];

  for (const rows of sources) {
    for (const row of rows) {
      matchedRows.set(createRowKey(row), row);
    }
  }

  return Array.from(matchedRows.values());
}

function getLatestPerformanceDate(rows: Array<{ data: string }>) {
  return rows.reduce<string | null>((latestDate, row) => {
    if (!row.data) {
      return latestDate;
    }

    if (!latestDate || row.data > latestDate) {
      return row.data;
    }

    return latestDate;
  }, null);
}

function getPerformanceEntityKey(row: {
  id_entregador: string | null;
  cpf_entregador?: string | null;
  numero_telefone?: string | null;
  nome_entregador?: string | null;
}) {
  const idKey = normalizeCodeValue(row.id_entregador);

  if (idKey) {
    return `id:${idKey}`;
  }

  const cpfKey = normalizeDigits(row.cpf_entregador);

  if (cpfKey) {
    return `cpf:${cpfKey}`;
  }

  const phoneKey = normalizeDigits(row.numero_telefone);

  if (phoneKey) {
    return `phone:${phoneKey}`;
  }

  const nameKey = normalizeSearchValue(row.nome_entregador);

  if (nameKey) {
    return `name:${nameKey}`;
  }

  return "";
}

function getDistinctPerformanceCourierCount(
  rows: Array<{
    id_entregador: string | null;
    cpf_entregador?: string | null;
    numero_telefone?: string | null;
    nome_entregador?: string | null;
  }>,
) {
  return new Set(
    rows
      .map((row) => getPerformanceEntityKey(row))
      .filter(Boolean),
  ).size;
}

function getShiftKeyFromPerformancePeriod(value: string | null | undefined): BagShift | null {
  const normalized = normalizeSearchValue(value);

  if (!normalized) {
    return null;
  }

  if (normalized.includes("almoco")) {
    return "almoco";
  }

  if (normalized.includes("merenda")) {
    return "merenda";
  }

  if (normalized.includes("jantar")) {
    return "jantar";
  }

  const hourMatch = normalized.match(/(\d{1,2})[:h]/);
  const hour = hourMatch ? Number(hourMatch[1]) : null;

  if (hour === null || !Number.isFinite(hour)) {
    return null;
  }

  if (hour < 15) {
    return "almoco";
  }

  if (hour < 18) {
    return "merenda";
  }

  return "jantar";
}

function getDateLabelShort(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00Z`));
}

function buildDateRangeBetween(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate || startDate > endDate) {
    return [];
  }

  const dates: string[] = [];
  let currentDate = startDate;

  while (currentDate <= endDate) {
    dates.push(currentDate);
    currentDate = subtractDaysFromIsoDate(currentDate, -1);
  }

  return dates;
}

function getTrendValueMap(rows: DailyPerformanceRow[] | ShiftPerformanceRow[], metric: keyof Pick<DailyPerformanceRow & ShiftPerformanceRow, "tsh" | "ar" | "caa" | "overtime">) {
  return rows.reduce<Record<string, number[]>>((acc, row) => {
    const value = normalizePercentMetric(row[metric]);

    if (value === null) {
      return acc;
    }

    acc[row.data] = [...(acc[row.data] || []), value];
    return acc;
  }, {});
}

function buildDistinctCourierTrend(
  dates: string[],
  dailyRows: DailyPerformanceRow[],
  shiftRows: ShiftPerformanceRow[],
) {
  return dates.map((date) => {
    const distinctCount = getDistinctPerformanceCourierCount([
      ...dailyRows.filter((row) => row.data === date),
      ...shiftRows.filter((row) => row.data === date),
    ]);

    return {
      date,
      label: getDateLabelShort(date),
      value: distinctCount,
    };
  });
}

function buildMetricTrend(
  dates: string[],
  dailyRows: DailyPerformanceRow[],
  shiftRows: ShiftPerformanceRow[],
  metric: "tsh" | "ar" | "caa" | "overtime",
) {
  const dailyValuesByDate = getTrendValueMap(dailyRows, metric);
  const shiftValuesByDate = getTrendValueMap(shiftRows, metric);

  return dates.map((date) => {
    const values =
      (dailyValuesByDate[date] && dailyValuesByDate[date].length > 0
        ? dailyValuesByDate[date]
        : shiftValuesByDate[date]) || [];

    return {
      date,
      label: getDateLabelShort(date),
      value: averageNumbers(values) || 0,
    };
  });
}

function getMostFrequentLabel(values: string[]) {
  if (values.length === 0) {
    return null;
  }

  const counts = values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .at(0)?.[0] || null;
}

function getPerformanceScore(summary: {
  avgTsh: number | null;
  avgAr: number | null;
  avgCaa: number | null;
  avgOvertime: number | null;
}) {
  const values = [
    summary.avgTsh !== null ? summary.avgTsh * 0.35 : null,
    summary.avgAr !== null ? summary.avgAr * 0.35 : null,
    summary.avgCaa !== null ? (100 - summary.avgCaa) * 0.15 : null,
    summary.avgOvertime !== null ? (100 - summary.avgOvertime) * 0.15 : null,
  ].filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((acc, value) => acc + value, 0);
}

function getPerformanceTier(summary: Omit<CourierPerformanceSummary, "tier" | "recommendation">): CourierPerformanceTier {
  if (!summary.hasPerformanceHistory) {
    return "sem_historico";
  }

  if (!summary.hasRunLast30Days) {
    return "parado";
  }

  if (summary.score !== null && summary.hasRunLast15Days && summary.score >= 85) {
    return "bom";
  }

  if (summary.score !== null && summary.hasRunLast15Days && summary.score >= 70) {
    return "regular";
  }

  return "atencao";
}

function getPerformanceRecommendation(summary: {
  tier: CourierPerformanceTier;
  dominantHotZone: string | null;
  dominantShift: string | null;
  hasRunLast30Days: boolean;
}) {
  if (!summary.hasRunLast30Days) {
    return "Sem rodada recente para recomendar escala.";
  }

  if (summary.dominantHotZone && summary.dominantShift) {
    return `Costuma rodar melhor em ${summary.dominantHotZone} no periodo ${summary.dominantShift}.`;
  }

  if (summary.dominantHotZone) {
    return `Costuma aparecer mais na Hot Zone ${summary.dominantHotZone}.`;
  }

  if (summary.dominantShift) {
    return `Costuma aparecer mais no periodo ${summary.dominantShift}.`;
  }

  if (summary.tier === "bom") {
    return "Tem historico bom e pode ajudar quando faltar slot.";
  }

  return "Ainda sem padrao operacional claro por hot zone ou periodo.";
}

function formatMetricLabel(value: number | null, { reverse = false }: { reverse?: boolean } = {}) {
  if (value === null) {
    return "--";
  }

  const rounded = `${value.toFixed(1)}%`;
  return reverse ? `${rounded}` : rounded;
}

function buildCourierPerformanceSummary(
  dailyRows: DailyPerformanceRow[],
  shiftRows: ShiftPerformanceRow[],
  latestPerformanceDate: string | null,
): CourierPerformanceSummary {
  const last15Start = latestPerformanceDate ? subtractDaysFromIsoDate(latestPerformanceDate, 14) : null;
  const last30Start = latestPerformanceDate ? subtractDaysFromIsoDate(latestPerformanceDate, 29) : null;
  const activityDates = Array.from(new Set([...dailyRows.map((row) => row.data), ...shiftRows.map((row) => row.data)]));
  const lastRunDate =
    getLatestPerformanceDate(dailyRows) ||
    getLatestPerformanceDate(shiftRows.map((row) => ({ data: row.data }))) ||
    null;
  const dailyRowsLast15 = last15Start ? dailyRows.filter((row) => row.data >= last15Start) : [];
  const dailyRowsLast30 = last30Start ? dailyRows.filter((row) => row.data >= last30Start) : [];
  const shiftRowsLast15 = last15Start ? shiftRows.filter((row) => row.data >= last15Start) : [];
  const shiftRowsLast30 = last30Start ? shiftRows.filter((row) => row.data >= last30Start) : [];
  const metricRowsLast30 = dailyRowsLast30.length > 0 ? dailyRowsLast30 : shiftRowsLast30;
  const activeDaysLast30 = new Set([
    ...dailyRowsLast30.map((row) => row.data),
    ...shiftRowsLast30.map((row) => row.data),
  ]).size;
  const totalOrdersLast30 = sumNumbers(metricRowsLast30.map((row) => parseNumber(row.pedidos_finalizados)));
  const avgTsh = averageNumbers(metricRowsLast30.map((row) => normalizePercentMetric(row.tsh)));
  const avgTshCritical = averageNumbers(
    dailyRowsLast30.length > 0
      ? dailyRowsLast30.map((row) => normalizePercentMetric(row.tsh_critico))
      : [],
  );
  const avgAr = averageNumbers(metricRowsLast30.map((row) => normalizePercentMetric(row.ar)));
  const avgCaa = averageNumbers(metricRowsLast30.map((row) => normalizePercentMetric(row.caa)));
  const avgOvertime = averageNumbers(metricRowsLast30.map((row) => normalizePercentMetric(row.overtime)));
  const score = getPerformanceScore({ avgTsh, avgAr, avgCaa, avgOvertime });
  const dominantHotZone = getMostFrequentLabel(
    shiftRowsLast30.map((row) => row.hot_zone || "").filter(Boolean),
  );
  const dominantShift = getMostFrequentLabel(
    shiftRowsLast30.map((row) => row.periodo_turno || "").filter(Boolean),
  );
  const baseSummary = {
    hasPerformanceHistory: dailyRows.length > 0 || shiftRows.length > 0,
    hasRunOnLatestDate: Boolean(latestPerformanceDate && activityDates.includes(latestPerformanceDate)),
    hasRunLast15Days: dailyRowsLast15.length > 0 || shiftRowsLast15.length > 0,
    hasRunLast30Days: dailyRowsLast30.length > 0 || shiftRowsLast30.length > 0,
    lastRunDate,
    activeDaysLast30,
    totalOrdersLast30,
    avgTsh,
    avgTshCritical,
    avgAr,
    avgCaa,
    avgOvertime,
    score,
    dominantHotZone,
    dominantShift,
  };
  const tier = getPerformanceTier(baseSummary);

  return {
    ...baseSummary,
    tier,
    recommendation: getPerformanceRecommendation({
      tier,
      dominantHotZone,
      dominantShift,
      hasRunLast30Days: baseSummary.hasRunLast30Days,
    }),
  };
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

type InformacoesBagPageProps = {
  searchParams?: Promise<{
    busca?: string | string[];
    situacao?: string | string[];
    status_bag?: string | string[];
    hotzone?: string | string[];
    turno?: string | string[];
    ordenacao?: string | string[];
    data_inicio?: string | string[];
    data_fim?: string | string[];
  }>;
};

export default async function InformacoesBagPage({ searchParams }: InformacoesBagPageProps) {
  const currentUser = await requireAppUser();

  if (!canAccessModule(currentUser, "bag_info")) {
    redirect("/?error=sem_permissao_bag");
  }

  const tenantId = currentUser.current_tenant.id;
  const [citiesResult, regionsResult, operators, couriersResult, bagStatusesResult, dailyPerformanceRows, shiftPerformanceRows] = await Promise.all([
    getTenantCities(tenantId),
    getTenantRegions(tenantId),
    getTenantOperators(tenantId),
    getBagCouriers(tenantId),
    getTenantBagStatuses(tenantId),
    getDailyPerformanceRows(tenantId),
    getShiftPerformanceRows(tenantId),
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
  const resolvedSearchParams = (await searchParams) || {};
  const rawSearch =
    typeof resolvedSearchParams.busca === "string"
      ? resolvedSearchParams.busca
      : resolvedSearchParams.busca?.[0] || "";
  const rawOperationalFilter =
    typeof resolvedSearchParams.situacao === "string"
      ? resolvedSearchParams.situacao
      : resolvedSearchParams.situacao?.[0] || "todos";
  const rawBagStatus =
    typeof resolvedSearchParams.status_bag === "string"
      ? resolvedSearchParams.status_bag
      : resolvedSearchParams.status_bag?.[0] || "";
  const rawHotZone =
    typeof resolvedSearchParams.hotzone === "string"
      ? resolvedSearchParams.hotzone
      : resolvedSearchParams.hotzone?.[0] || "";
  const rawTurno =
    typeof resolvedSearchParams.turno === "string"
      ? resolvedSearchParams.turno
      : resolvedSearchParams.turno?.[0] || "";
  const rawRankingOrder =
    typeof resolvedSearchParams.ordenacao === "string"
      ? resolvedSearchParams.ordenacao
      : resolvedSearchParams.ordenacao?.[0] || "melhor_pior";
  const rawDataInicio =
    typeof resolvedSearchParams.data_inicio === "string"
      ? resolvedSearchParams.data_inicio
      : resolvedSearchParams.data_inicio?.[0] || "";
  const rawDataFim =
    typeof resolvedSearchParams.data_fim === "string"
      ? resolvedSearchParams.data_fim
      : resolvedSearchParams.data_fim?.[0] || "";
  const operationalFilter = (Object.keys(OPERATIONAL_FILTER_LABELS) as OperationalFilter[]).includes(
    rawOperationalFilter as OperationalFilter,
  )
    ? (rawOperationalFilter as OperationalFilter)
    : "todos";
  const selectedBagStatus = bagStatusesResult.data.some((status) => status.slug === rawBagStatus)
    ? rawBagStatus
    : "";
  const selectedTurno = (Object.keys(BAG_SHIFT_LABELS) as BagShift[]).includes(rawTurno as BagShift)
    ? (rawTurno as BagShift)
    : "";
  const rankingOrder = (Object.keys(RANKING_ORDER_LABELS) as RankingOrder[]).includes(
    rawRankingOrder as RankingOrder,
  )
    ? (rawRankingOrder as RankingOrder)
    : "melhor_pior";
  const searchTerm = normalizeSearchValue(rawSearch);
  const latestPerformanceDate = getLatestPerformanceDate([
    ...dailyPerformanceRows,
    ...shiftPerformanceRows.map((row) => ({ data: row.data })),
  ]);
  const defaultDashboardStart = latestPerformanceDate ? subtractDaysFromIsoDate(latestPerformanceDate, 13) : "";
  const defaultDashboardEnd = latestPerformanceDate || "";
  const selectedDashboardStart =
    rawDataInicio && (!defaultDashboardEnd || rawDataInicio <= defaultDashboardEnd)
      ? rawDataInicio
      : defaultDashboardStart;
  const selectedDashboardEnd =
    rawDataFim && (!selectedDashboardStart || rawDataFim >= selectedDashboardStart)
      ? rawDataFim
      : defaultDashboardEnd;
  const availableHotZones = Array.from(
    new Set(
      [
        ...regionsResult.data.map((region) => region.name),
        ...shiftPerformanceRows.map((row) => row.hot_zone || "").filter(Boolean),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    ),
  );
  const selectedHotZone = availableHotZones.find(
    (value) => normalizeSearchValue(value) === normalizeSearchValue(rawHotZone),
  ) || "";
  const last15Start = latestPerformanceDate ? subtractDaysFromIsoDate(latestPerformanceDate, 14) : null;
  const dashboardDailyRows =
    selectedDashboardStart && selectedDashboardEnd
      ? dailyPerformanceRows.filter(
          (row) => row.data >= selectedDashboardStart && row.data <= selectedDashboardEnd,
        )
      : dailyPerformanceRows;
  const dashboardShiftRows =
    selectedDashboardStart && selectedDashboardEnd
      ? shiftPerformanceRows.filter(
          (row) => row.data >= selectedDashboardStart && row.data <= selectedDashboardEnd,
        )
      : shiftPerformanceRows;
  const dashboardDatesWithData = Array.from(
    new Set([
      ...dashboardDailyRows.map((row) => row.data),
      ...dashboardShiftRows.map((row) => row.data),
    ]),
  ).sort();
  const dashboardTrendDates =
    dashboardDatesWithData.length > 0
      ? dashboardDatesWithData
      : buildDateRangeBetween(selectedDashboardStart, selectedDashboardEnd);
  const performanceRowsOnLatestDate = latestPerformanceDate
    ? [
        ...dailyPerformanceRows.filter((row) => row.data === latestPerformanceDate),
        ...shiftPerformanceRows.filter((row) => row.data === latestPerformanceDate),
      ]
    : [];
  const performanceRowsLast15Days = last15Start
    ? [
        ...dailyPerformanceRows.filter((row) => row.data >= last15Start),
        ...shiftPerformanceRows.filter((row) => row.data >= last15Start),
      ]
    : [];
  const dailyPerformanceIndex = buildPerformanceIndex(dailyPerformanceRows);
  const shiftPerformanceIndex = buildPerformanceIndex(shiftPerformanceRows);
  const hotZoneFilterActive = Boolean(selectedHotZone);
  const turnoFilterActive = Boolean(selectedTurno);
  const contextFilterActive = hotZoneFilterActive || turnoFilterActive;
  const couriersWithInsights = sortCouriers(
    couriers.map((courier) => {
      const matchedDailyRows = getMatchedPerformanceRows(
        courier,
        dailyPerformanceIndex,
        (row) => [row.data, row.id_entregador || "", row.cpf_entregador || "", row.numero_telefone || ""].join("|"),
      );
      const matchedShiftRows = getMatchedPerformanceRows(
        courier,
        shiftPerformanceIndex,
        (row) =>
          [
            row.data,
            row.periodo_turno || "",
            row.hot_zone || "",
            row.id_entregador || "",
            row.cpf_entregador || "",
            row.numero_telefone || "",
          ].join("|"),
      );
      const contextShiftRows = matchedShiftRows.filter((row) => {
        const hotZoneMatches =
          !hotZoneFilterActive || normalizeSearchValue(row.hot_zone) === normalizeSearchValue(selectedHotZone);
        const turnoMatches =
          !turnoFilterActive || getShiftKeyFromPerformancePeriod(row.periodo_turno) === selectedTurno;
        return hotZoneMatches && turnoMatches;
      });
      const matchesSelectedHotZone =
        !hotZoneFilterActive ||
        courier.regions.some((region) => normalizeSearchValue(region) === normalizeSearchValue(selectedHotZone)) ||
        contextShiftRows.some((row) => normalizeSearchValue(row.hot_zone) === normalizeSearchValue(selectedHotZone));
      const matchesSelectedTurno =
        !turnoFilterActive ||
        courier.preferred_shifts.includes(selectedTurno as BagShift) ||
        contextShiftRows.some((row) => getShiftKeyFromPerformancePeriod(row.periodo_turno) === selectedTurno);
      const performance = buildCourierPerformanceSummary(matchedDailyRows, matchedShiftRows, latestPerformanceDate);
      const listPerformance =
        contextFilterActive
          ? buildCourierPerformanceSummary([], contextShiftRows, latestPerformanceDate)
          : performance;

      return {
        ...courier,
        performance,
        listPerformance,
        hasContextMatch: contextShiftRows.length > 0,
        matchesSelectedHotZone,
        matchesSelectedTurno,
      };
    }),
    rankingOrder,
  );
  const filteredCouriers = couriersWithInsights.filter((courier) => {
    const matchesContextFilters =
      (!hotZoneFilterActive || courier.matchesSelectedHotZone) &&
      (!turnoFilterActive || courier.matchesSelectedTurno);
    const matchesBagStatus = !selectedBagStatus || courier.bag_status === selectedBagStatus;

    return (
      matchesContextFilters &&
      matchesBagStatus &&
      matchesOperationalFilter(courier, operationalFilter) &&
      matchesCourierSearch(courier, searchTerm, bagStatusLabels)
    );
  });
  const totalRegisteredCouriers = couriersWithInsights.length;
  const couriersRunningOnLatestDate = getDistinctPerformanceCourierCount(performanceRowsOnLatestDate);
  const couriersRunningLast15Days = getDistinctPerformanceCourierCount(performanceRowsLast15Days);
  const couriersInactiveLast15Days = couriersWithInsights.filter((courier) => !courier.performance.hasRunLast15Days).length;
  const couriersInactiveLast30Days = couriersWithInsights.filter((courier) => !courier.performance.hasRunLast30Days).length;
  const couriersNeverRan = couriersWithInsights.filter((courier) => !courier.performance.hasPerformanceHistory).length;
  const couriersEverRan = couriersWithInsights.filter((courier) => courier.performance.hasPerformanceHistory).length;
  const goodCandidates = couriersWithInsights.filter((courier) => courier.performance.tier === "bom").length;
  const couriersNeedingAttention = couriersWithInsights.filter(
    (courier) => courier.performance.tier === "atencao" || courier.performance.tier === "parado",
  ).length;
  const highlightedCandidates = couriersWithInsights
    .filter((courier) => courier.performance.tier === "bom")
    .slice(0, 3);
  const dashboardDailyPerformanceIndex = buildPerformanceIndex(dashboardDailyRows);
  const dashboardShiftPerformanceIndex = buildPerformanceIndex(dashboardShiftRows);
  const dashboardCouriersWithInsights = couriers.map((courier) => {
    const matchedDailyRows = getMatchedPerformanceRows(
      courier,
      dashboardDailyPerformanceIndex,
      (row) => [row.data, row.id_entregador || "", row.cpf_entregador || "", row.numero_telefone || ""].join("|"),
    );
    const matchedShiftRows = getMatchedPerformanceRows(
      courier,
      dashboardShiftPerformanceIndex,
      (row) =>
        [
          row.data,
          row.periodo_turno || "",
          row.hot_zone || "",
          row.id_entregador || "",
          row.cpf_entregador || "",
          row.numero_telefone || "",
        ].join("|"),
    );

    return buildCourierPerformanceSummary(matchedDailyRows, matchedShiftRows, selectedDashboardEnd || latestPerformanceDate);
  });
  const dashboardCouriersRunningInRange = dashboardCouriersWithInsights.filter(
    (item) => item.hasPerformanceHistory,
  ).length;
  const dashboardCouriersInactiveInRange = dashboardCouriersWithInsights.filter(
    (item) => !item.hasPerformanceHistory,
  ).length;
  const dashboardGoodCandidates = dashboardCouriersWithInsights.filter((item) => item.tier === "bom").length;
  const dashboardAttentionCount = dashboardCouriersWithInsights.filter(
    (item) => item.tier === "atencao" || item.tier === "parado",
  ).length;
  const bagStatusSummary = bagStatusesResult.data.map((status) => ({
    ...status,
    count: couriersWithInsights.filter((courier) => courier.bag_status === status.slug).length,
  }));
  const activityTrend = buildDistinctCourierTrend(dashboardTrendDates, dashboardDailyRows, dashboardShiftRows);
  const tshTrend = buildMetricTrend(dashboardTrendDates, dashboardDailyRows, dashboardShiftRows, "tsh");
  const arTrend = buildMetricTrend(dashboardTrendDates, dashboardDailyRows, dashboardShiftRows, "ar");
  const caaTrend = buildMetricTrend(dashboardTrendDates, dashboardDailyRows, dashboardShiftRows, "caa");
  const overtimeTrend = buildMetricTrend(dashboardTrendDates, dashboardDailyRows, dashboardShiftRows, "overtime");

  return (
    <AppShell
      currentPath="/informacoes-bag"
      title="Entregadores"
      description="Olhe a base inteira, descubra quem esta rodando, quem sumiu da operacao e quem pode cobrir hot zones e periodos com mais seguranca."
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
          <section className="dashboard-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Visao da base</h2>
                  <p>
                    {selectedDashboardStart && selectedDashboardEnd
                      ? `Leitura do periodo entre ${formatDateLabel(selectedDashboardStart)} e ${formatDateLabel(selectedDashboardEnd)}.`
                      : "Ainda nao existe leitura de performance para comparar a base."}
                  </p>
                </div>
                <form action="/informacoes-bag" method="get" className="dashboard-date-toolbar">
                  <input type="hidden" name="busca" value={rawSearch} />
                  <input type="hidden" name="status_bag" value={selectedBagStatus} />
                  <input type="hidden" name="hotzone" value={selectedHotZone} />
                  <input type="hidden" name="turno" value={selectedTurno} />
                  <input type="hidden" name="situacao" value={operationalFilter} />
                  <input type="hidden" name="ordenacao" value={rankingOrder} />
                  <input
                    type="date"
                    name="data_inicio"
                    defaultValue={selectedDashboardStart}
                    className="text-input dashboard-date-input"
                  />
                  <input
                    type="date"
                    name="data_fim"
                    defaultValue={selectedDashboardEnd}
                    className="text-input dashboard-date-input"
                  />
                  <button type="submit" className="secondary-button">
                    Atualizar graficos
                  </button>
                </form>
              </div>

              <div className="comparison-bars">
                {[
                  { label: "Cadastrados", value: totalRegisteredCouriers, tone: "neutral" },
                  { label: "Rodaram no periodo", value: dashboardCouriersRunningInRange, tone: "success" },
                  { label: "Sem rodar no periodo", value: dashboardCouriersInactiveInRange, tone: "warning" },
                  { label: "Bons candidatos", value: dashboardGoodCandidates, tone: "info" },
                  { label: "Pedem atencao", value: dashboardAttentionCount, tone: "danger" },
                ].map((item) => (
                  <div key={item.label} className="comparison-row">
                    <div className="comparison-row-top">
                      <strong>{item.label}</strong>
                      <span>{item.value}</span>
                    </div>
                    <div className="comparison-track">
                      <div
                        className={`comparison-fill comparison-fill-${item.tone}`}
                        style={{
                          width: `${totalRegisteredCouriers > 0 ? (item.value / totalRegisteredCouriers) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="efficiency-grid">
                <article className="platform-note">
                  <strong>Eficiencia da base</strong>
                  <p>
                    {totalRegisteredCouriers > 0
                      ? `${Math.round((dashboardCouriersRunningInRange / totalRegisteredCouriers) * 100)}% da base cadastrada rodou no periodo selecionado.`
                      : "Sem base cadastrada para comparar."}
                  </p>
                </article>
                <article className="platform-note">
                  <strong>Quem pode cobrir slot</strong>
                  <p>
                    {highlightedCandidates.length > 0
                      ? highlightedCandidates
                          .map((courier) => {
                            const place = courier.performance.dominantHotZone || "Hot Zone sem padrao";
                            const shift = courier.performance.dominantShift || "periodo sem padrao";
                            return `${courier.full_name} (${place} / ${shift})`;
                          })
                          .join(" · ")
                      : "Ainda nao ha candidatos fortes o suficiente para sugerir cobertura automatica."}
                  </p>
                </article>
              </div>

              <div className="status-chip-grid">
                {bagStatusSummary.map((status) => (
                  <span key={status.id} className="status-chip">
                    {status.label}: {status.count}
                  </span>
                ))}
              </div>
            </section>

            <section className="panel">
              <TrendChartPanel
                title="Atividade da base"
                description="Entregadores por dia no periodo selecionado"
                eyebrow="Entregadores rodando"
                value={activityTrend.at(-1)?.value || 0}
                caption={`Pico recente de ${Math.max(...activityTrend.map((point) => point.value), 0)} entregadores no periodo.`}
                points={activityTrend}
                toneClass="sparkline-activity"
                format="integer"
              />
            </section>
          </section>

          <section className="metric-trend-grid">
            {[
              {
                title: "TSH",
                value: tshTrend.at(-1)?.value || 0,
                points: tshTrend,
                subtitle: "Tempo online medio",
                className: "sparkline-success",
              },
              {
                title: "AR",
                value: arTrend.at(-1)?.value || 0,
                points: arTrend,
                subtitle: "Aceitacao de pedidos",
                className: "sparkline-info",
              },
              {
                title: "CAA",
                value: caaTrend.at(-1)?.value || 0,
                points: caaTrend,
                subtitle: "Cancelamento, menor melhor",
                className: "sparkline-warning",
              },
              {
                title: "Overtime",
                value: overtimeTrend.at(-1)?.value || 0,
                points: overtimeTrend,
                subtitle: "Atraso, menor melhor",
                className: "sparkline-danger",
              },
            ].map((metric) => (
              <article key={metric.title} className="metric-trend-card">
                <TrendChartPanel
                  eyebrow={metric.title}
                  value={metric.value}
                  subtitle={metric.subtitle}
                  points={metric.points}
                  toneClass={metric.className}
                  format="percent"
                  compact
                />
              </article>
            ))}
          </section>

          {citiesResult.data.length === 0 ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Configure o Perfil da empresa</h2>
                  <p>Cadastre a primeira cidade no Perfil da empresa antes de usar o modulo de entregadores.</p>
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
                  <p>O entregador precisa informar qual Hot Zone deseja atuar antes de ser salvo no banco.</p>
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

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Painel de entregadores</h2>
                <p>
                  {searchTerm
                    ? `Mostrando ${filteredCouriers.length} de ${couriersWithInsights.length} entregadores para a busca atual.`
                    : [
                        OPERATIONAL_FILTER_LABELS[operationalFilter],
                        selectedBagStatus ? `Status BAG: ${bagStatusLabels[selectedBagStatus] || selectedBagStatus}` : "",
                        selectedHotZone ? `Hot Zone: ${selectedHotZone}` : "",
                        selectedTurno ? `Turno: ${BAG_SHIFT_LABELS[selectedTurno as BagShift]}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
              </div>
              {citiesResult.data.length > 0 &&
              regionsResult.data.length > 0 &&
              operators.length > 0 &&
              bagStatusesResult.data.length > 0 ? (
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
              <form action="/informacoes-bag" method="get" className="courier-toolbar courier-toolbar-stack">
                <input type="hidden" name="data_inicio" value={selectedDashboardStart} />
                <input type="hidden" name="data_fim" value={selectedDashboardEnd} />
                <div className="courier-toolbar-row courier-toolbar-row-primary">
                  <input
                    type="search"
                    name="busca"
                    defaultValue={rawSearch}
                    className="text-input courier-search-input courier-filter-control"
                    placeholder="Pesquisar por nome, ID, telefone, CPF, status, Hot Zone ou operador"
                  />
                  <select
                    name="status_bag"
                    defaultValue={selectedBagStatus}
                    className="select-input courier-filter-select courier-filter-control"
                  >
                    <option value="">Todos os status BAG</option>
                    {bagStatusesResult.data.map((status) => (
                      <option key={status.id} value={status.slug}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="courier-toolbar-row courier-toolbar-row-secondary">
                  <select
                    name="hotzone"
                    defaultValue={selectedHotZone}
                    className="select-input courier-filter-select courier-filter-control"
                  >
                    <option value="">Todas as Hot Zones</option>
                    {availableHotZones.map((hotZone) => (
                      <option key={hotZone} value={hotZone}>
                        {hotZone}
                      </option>
                    ))}
                  </select>
                  <select
                    name="turno"
                    defaultValue={selectedTurno}
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
                    defaultValue={operationalFilter}
                    className="select-input courier-filter-select courier-filter-control"
                  >
                    {(Object.keys(OPERATIONAL_FILTER_LABELS) as OperationalFilter[]).map((filterKey) => (
                      <option key={filterKey} value={filterKey}>
                        {OPERATIONAL_FILTER_LABELS[filterKey]}
                      </option>
                    ))}
                  </select>
                  <select
                    name="ordenacao"
                    defaultValue={rankingOrder}
                    className="select-input courier-filter-select courier-filter-control"
                  >
                    {(Object.keys(RANKING_ORDER_LABELS) as RankingOrder[]).map((orderKey) => (
                      <option key={orderKey} value={orderKey}>
                        {RANKING_ORDER_LABELS[orderKey]}
                      </option>
                    ))}
                  </select>
                  <div className="courier-toolbar-actions">
                    <button type="submit" className="primary-button">
                      Filtrar
                    </button>
                    {rawSearch ||
                    selectedBagStatus ||
                    operationalFilter !== "todos" ||
                    selectedHotZone ||
                    selectedTurno ||
                    rankingOrder !== "melhor_pior" ? (
                      <Link href="/informacoes-bag" className="secondary-button link-button courier-reset-button">
                        Limpar
                      </Link>
                    ) : null}
                  </div>
                </div>
              </form>
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
                          Contexto atual:{" "}
                          {selectedHotZone ? `Hot Zone ${selectedHotZone}` : "todas as Hot Zones"} /{" "}
                          {selectedTurno ? BAG_SHIFT_LABELS[selectedTurno as BagShift] : "todos os turnos"}
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
                          <span>{formatMetricLabel(courier.listPerformance.avgCaa, { reverse: true })}</span>
                        </span>
                        <span className="courier-performance-stat">
                          <strong>Overtime</strong>
                          <span>{formatMetricLabel(courier.listPerformance.avgOvertime, { reverse: true })}</span>
                        </span>
                        <span className="courier-performance-stat">
                          <strong>TSH critico</strong>
                          <span>{formatMetricLabel(courier.listPerformance.avgTshCritical)}</span>
                        </span>
                      </div>
                      <p className="courier-highlight">
                        <strong>Melhor encaixe:</strong>{" "}
                        {courier.listPerformance.recommendation}
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
                      <span
                        className={`day-chip ${PERFORMANCE_TIER_CLASS_NAMES[courier.listPerformance.tier]}`}
                      >
                        {PERFORMANCE_TIER_LABELS[courier.listPerformance.tier]}
                      </span>
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
              ) : couriersWithInsights.length > 0 ? (
                <article className="user-card">
                  <div>
                    <strong>Nenhum entregador encontrado</strong>
                    <p>Altere a busca ou o filtro para localizar por nome, ID, telefone, CPF, status, Hot Zone, operador ou situacao operacional.</p>
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
        </>
      )}
    </AppShell>
  );
}
