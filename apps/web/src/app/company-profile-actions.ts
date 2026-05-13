"use server";

import { revalidatePath } from "next/cache";

import { requireSettingsAccess } from "@/lib/auth";
import { createBagStatusSlug } from "@/lib/bag-config";
import { isCompanyAccessSchemaMissing } from "@/lib/company-access";
import { supabaseServer } from "@/lib/supabase-server";

export type CompanyProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const settingsSchemaMessage =
  "Falta rodar a migration do perfil da empresa. Execute supabase/add_bag_information_module.sql.";

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function messageFromError(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message?.toLowerCase() || "";

  if (message.includes("duplicate key") || message.includes("unique")) {
    return fallback;
  }

  return error?.message || fallback;
}

export async function updateTenantSettingsAction(
  _prevState: CompanyProfileActionState,
  formData: FormData,
): Promise<CompanyProfileActionState> {
  const actor = await requireSettingsAccess();
  const tenantId = actor.current_tenant.id;
  const westwindLogin = normalizeText(String(formData.get("westwind_login") || ""));
  const westwindPassword = String(formData.get("westwind_password") || "").trim();

  const { error } = await supabaseServer.from("tenant_settings").upsert(
    {
      tenant_id: tenantId,
      westwind_login: westwindLogin || null,
      westwind_password: westwindPassword || null,
      updated_by: actor.id,
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return {
      status: "error",
      message: error.message,
    };
  }

  revalidatePath("/perfil-empresa");
  revalidatePath("/informacoes-bag");

  return {
    status: "success",
    message: "Perfil da empresa atualizado com sucesso.",
  };
}

export async function createTenantBagStatusAction(
  _prevState: CompanyProfileActionState,
  formData: FormData,
): Promise<CompanyProfileActionState> {
  const actor = await requireSettingsAccess();
  const tenantId = actor.current_tenant.id;
  const label = normalizeText(String(formData.get("label") || ""));

  if (label.length < 2) {
    return { status: "error", message: "Digite um nome valido para o status BAG." };
  }

  const slug = createBagStatusSlug(label);

  if (!slug) {
    return { status: "error", message: "Nao foi possivel gerar um identificador para esse status." };
  }

  const { count, error: countError } = await supabaseServer
    .from("tenant_bag_statuses")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (countError) {
    if (isCompanyAccessSchemaMissing(countError)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return { status: "error", message: countError.message };
  }
  const { error } = await supabaseServer.from("tenant_bag_statuses").insert({
    tenant_id: tenantId,
    slug,
    label,
    sort_order: count ?? 0,
    is_active: true,
    created_by: actor.id,
  });

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return {
      status: "error",
      message: messageFromError(error, "Esse status BAG ja existe para a empresa."),
    };
  }

  revalidatePath("/perfil-empresa");
  revalidatePath("/informacoes-bag");

  return {
    status: "success",
    message: "Status BAG cadastrado com sucesso.",
  };
}
