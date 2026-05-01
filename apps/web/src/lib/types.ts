export type WaitlistStatus = "pendente" | "agendado" | "recusado" | "cancelado";

export type WaitlistRequest = {
  id: string;
  created_at: string;
  updated_at: string;
  nome: string;
  cpf: string;
  telefone: string;
  praca: string;
  horario_label: string;
  horario_inicio: string;
  horario_fim: string;
  escala_dia_label: string;
  status: WaitlistStatus;
  observacao: string | null;
  origem: string;
  telegram_user_id: number | null;
  telegram_username: string | null;
  telegram_chat_id: number | null;
  is_used: boolean | null;
  used_at: string | null;
};

export type PageFilters = {
  search?: string;
  praca?: string;
  horario?: string;
  day?: string;
  status?: string;
  date?: string;
  usage?: string;
};
