"use server";

import { revalidatePath } from "next/cache";

import { requireSettingsAccess } from "@/lib/auth";
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
