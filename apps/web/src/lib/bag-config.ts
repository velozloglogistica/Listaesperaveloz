export const BAG_STATUS_OPTIONS = [
  { value: "bag_com_entregador", label: "BAG com entregador" },
  { value: "chamar_para_pegar_bag", label: "Chamar para pegar BAG" },
  { value: "desvinculado", label: "Desvinculado" },
] as const;

export const BAG_VEHICLE_OPTIONS = [
  { value: "bicicleta", label: "Bicicleta" },
  { value: "motocicleta", label: "Motocicleta" },
] as const;

export const BAG_SHIFT_OPTIONS = [
  { value: "almoco", label: "Almoco" },
  { value: "merenda", label: "Merenda" },
  { value: "jantar", label: "Jantar" },
] as const;

export const BAG_WEEKDAY_OPTIONS = [
  { value: "segunda", label: "Segunda" },
  { value: "terca", label: "Terca" },
  { value: "quarta", label: "Quarta" },
  { value: "quinta", label: "Quinta" },
  { value: "sexta", label: "Sexta" },
  { value: "sabado", label: "Sabado" },
  { value: "domingo", label: "Domingo" },
] as const;

export type BagStatus = (typeof BAG_STATUS_OPTIONS)[number]["value"];
export type BagVehicle = (typeof BAG_VEHICLE_OPTIONS)[number]["value"];
export type BagShift = (typeof BAG_SHIFT_OPTIONS)[number]["value"];
export type BagWeekday = (typeof BAG_WEEKDAY_OPTIONS)[number]["value"];

export const BAG_STATUS_LABELS: Record<BagStatus, string> = Object.fromEntries(
  BAG_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<BagStatus, string>;

export const BAG_VEHICLE_LABELS: Record<BagVehicle, string> = Object.fromEntries(
  BAG_VEHICLE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<BagVehicle, string>;

export const BAG_SHIFT_LABELS: Record<BagShift, string> = Object.fromEntries(
  BAG_SHIFT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<BagShift, string>;

export const BAG_WEEKDAY_LABELS: Record<BagWeekday, string> = Object.fromEntries(
  BAG_WEEKDAY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<BagWeekday, string>;
