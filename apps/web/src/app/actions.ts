"use server";

import { revalidatePath } from "next/cache";

import { supabaseServer } from "@/lib/supabase-server";
import type { WaitlistStatus } from "@/lib/types";

const allowedStatuses: WaitlistStatus[] = [
  "pendente",
  "agendado",
  "recusado",
  "cancelado",
];

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
