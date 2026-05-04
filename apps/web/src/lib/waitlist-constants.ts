export const PRACAS = [
  "Chapada",
  "Ponta Negra",
  "Santa Etelvina",
  "Tancredo Neves",
] as const;

export const HORARIOS = {
  "Almoço": ["11:00:00", "14:00:00"],
  Merenda: ["14:00:00", "18:00:00"],
  Jantar: ["18:00:00", "22:00:00"],
} as const;

export type PracaOption = (typeof PRACAS)[number];
export type HorarioOption = keyof typeof HORARIOS;
