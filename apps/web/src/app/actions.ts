"use server";

import { revalidatePath } from "next/cache";

import { supabaseServer } from "@/lib/supabase-server";
import type { WaitlistStatus } from "@/lib/types";
import { HORARIOS, PRACAS } from "@/lib/waitlist-constants";

const allowedStatuses: WaitlistStatus[] = [
  "pendente",
  "agendado",
  "recusado",
  "cancelado",
];

export type ManualWaitlistActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function cpfValido(cpf: string) {
  const clean = sanitizeDigits(cpf);
  return clean.length === 11 && new Set(clean).size > 1;
}

function telefoneValido(telefone: string) {
  const clean = sanitizeDigits(telefone);
  return clean.length >= 10 && clean.length <= 13;
}

function normalizeDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }

  return value;
}

function getScaleDayLabelFromDate(escalaData: string) {
  const weekday = new Date(`${escalaData}T12:00:00Z`).getUTCDay();

  if (weekday === 5) return "Sexta";
  if (weekday === 6) return "Sábado";
  if (weekday === 0) return "Domingo";
  return "Hoje";
}

export async function updateWaitlistStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "") as WaitlistStatus;

  if (!id || !allowedStatuses.includes(status)) {
    throw new Error("Dados invalidos para atualizar status.");
  }

  const { error } = await supabaseServer
    .from("waitlist_requests")
    .update({ status })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
}

export async function toggleUsedState(formData: FormData) {
  const id = String(formData.get("id") || "");
  const currentValue = String(formData.get("currentValue") || "false") === "true";
  const nextValue = !currentValue;

  if (!id) {
    throw new Error("Solicitacao invalida.");
  }

  const { error } = await supabaseServer
    .from("waitlist_requests")
    .update({
      is_used: nextValue,
      used_at: nextValue ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
}

export async function createManualWaitlistRequest(
  _prevState: ManualWaitlistActionState,
  formData: FormData,
): Promise<ManualWaitlistActionState> {
  const nome = String(formData.get("nome") || "").replace(/\s+/g, " ").trim();
  const cpf = sanitizeDigits(String(formData.get("cpf") || ""));
  const telefone = sanitizeDigits(String(formData.get("telefone") || ""));
  const praca = String(formData.get("praca") || "");
  const horarioLabel = String(formData.get("horario_label") || "");
  const escalaData = normalizeDateInput(String(formData.get("escala_data") || ""));

  if (nome.length < 5) {
    return { status: "error", message: "Digite um nome completo valido." };
  }

  if (!cpfValido(cpf)) {
    return { status: "error", message: "CPF invalido. Confira os 11 numeros." };
  }

  if (!telefoneValido(telefone)) {
    return { status: "error", message: "Telefone invalido. Confira o DDD e o numero." };
  }

  if (!PRACAS.includes(praca as (typeof PRACAS)[number])) {
    return { status: "error", message: "Escolha uma hotzone valida." };
  }

  if (!(horarioLabel in HORARIOS)) {
    return { status: "error", message: "Escolha um horario valido." };
  }

  if (!escalaData) {
    return { status: "error", message: "Escolha uma data valida para a escala." };
  }

  const { data: existing, error: existingError } = await supabaseServer
    .from("waitlist_requests")
    .select("id")
    .eq("cpf", cpf)
    .eq("praca", praca)
    .eq("horario_label", horarioLabel)
    .eq("escala_data", escalaData)
    .limit(1);

  if (existingError) {
    return { status: "error", message: existingError.message };
  }

  if (existing && existing.length > 0) {
    return {
      status: "error",
      message: "Ja existe uma solicitacao com esse CPF, hotzone, horario e data.",
    };
  }

  const [horarioInicio, horarioFim] = HORARIOS[horarioLabel as keyof typeof HORARIOS];
  const escalaDiaLabel = getScaleDayLabelFromDate(escalaData);

  const { error } = await supabaseServer.from("waitlist_requests").insert({
    nome,
    cpf,
    telefone,
    praca,
    horario_label: horarioLabel,
    horario_inicio: horarioInicio,
    horario_fim: horarioFim,
    escala_dia_label: escalaDiaLabel,
    escala_data: escalaData,
    status: "pendente",
    origem: "manual",
    telegram_user_id: null,
    telegram_username: null,
    telegram_chat_id: null,
    is_used: false,
    used_at: null,
  });

  if (error) {
    const message = error.message.toLowerCase();

    if (message.includes("duplicate key") || message.includes("unique")) {
      return {
        status: "error",
        message: "Ja existe uma solicitacao com esse CPF, hotzone, horario e data.",
      };
    }

    return { status: "error", message: error.message };
  }

  revalidatePath("/");

  return {
    status: "success",
    message: "Solicitacao adicionada manualmente com sucesso.",
  };
}
