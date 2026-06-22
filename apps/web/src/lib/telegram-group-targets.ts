export type TelegramGroupTarget = {
  id: string;
  nome: string;
  hotzone: string;
  telegram_chat_id: number;
};

export const TELEGRAM_GROUP_TARGETS: TelegramGroupTarget[] = [
  {
    id: "chapada",
    nome: "VelozLog - Chapada",
    hotzone: "Chapada",
    telegram_chat_id: -1003755045376,
  },
  {
    id: "tancredo-neves",
    nome: "VelozLog - Tancredo Neves",
    hotzone: "Tancredo Neves",
    telegram_chat_id: -1003735399445,
  },
  {
    id: "ponta-negra",
    nome: "VelozLog - Ponta Negra",
    hotzone: "Ponta Negra",
    telegram_chat_id: -1003041879752,
  },
  {
    id: "santa-etelvina",
    nome: "VelozLog - Santa Etelvina",
    hotzone: "Santa Etelvina",
    telegram_chat_id: -1003879281432,
  },
];
