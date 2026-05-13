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

export async function updateTenantBagStatusAction(
  _prevState: CompanyProfileActionState,
  formData: FormData,
): Promise<CompanyProfileActionState> {
  const actor = await requireSettingsAccess();
  const tenantId = actor.current_tenant.id;
  const id = String(formData.get("id") || "");
  const label = normalizeText(String(formData.get("label") || ""));

  if (!id) {
    return { status: "error", message: "Status BAG invalido." };
  }

  if (label.length < 2) {
    return { status: "error", message: "Digite um nome valido para o status BAG." };
  }

  const { error } = await supabaseServer
    .from("tenant_bag_statuses")
    .update({ label })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return {
      status: "error",
      message: messageFromError(error, "Nao foi possivel atualizar o status BAG."),
    };
  }

  revalidatePath("/perfil-empresa");
  revalidatePath("/informacoes-bag");

  return {
    status: "success",
    message: "Status BAG atualizado com sucesso.",
  };
}

export async function deleteTenantBagStatusAction(
  _prevState: CompanyProfileActionState,
  formData: FormData,
): Promise<CompanyProfileActionState> {
  const actor = await requireSettingsAccess();
  const tenantId = actor.current_tenant.id;
  const id = String(formData.get("id") || "");

  if (!id) {
    return { status: "error", message: "Status BAG invalido." };
  }

  const { data: statusData, error: statusError } = await supabaseServer
    .from("tenant_bag_statuses")
    .select("slug")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (statusError) {
    if (isCompanyAccessSchemaMissing(statusError)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return { status: "error", message: statusError.message };
  }

  if (!statusData) {
    return { status: "error", message: "Status BAG nao encontrado." };
  }

  const { count, error: usageError } = await supabaseServer
    .from("bag_couriers")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("bag_status", statusData.slug);

  if (usageError) {
    if (isCompanyAccessSchemaMissing(usageError)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return { status: "error", message: usageError.message };
  }

  if ((count || 0) > 0) {
    return {
      status: "error",
      message: "Esse status ja esta sendo usado por entregadores e nao pode ser excluido agora.",
    };
  }

  const { error } = await supabaseServer
    .from("tenant_bag_statuses")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return { status: "error", message: error.message };
  }

  revalidatePath("/perfil-empresa");
  revalidatePath("/informacoes-bag");

  return {
    status: "success",
    message: "Status BAG excluido com sucesso.",
  };
}

export async function updateTenantCityAction(
  _prevState: CompanyProfileActionState,
  formData: FormData,
): Promise<CompanyProfileActionState> {
  const actor = await requireSettingsAccess();
  const tenantId = actor.current_tenant.id;
  const id = String(formData.get("id") || "");
  const name = normalizeText(String(formData.get("name") || ""));

  if (!id) {
    return { status: "error", message: "Cidade invalida." };
  }

  if (name.length < 2) {
    return { status: "error", message: "Digite um nome valido para a cidade." };
  }

  const { error } = await supabaseServer
    .from("tenant_cities")
    .update({ name })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return {
      status: "error",
      message: messageFromError(error, "Nao foi possivel atualizar a cidade."),
    };
  }

  revalidatePath("/perfil-empresa");
  revalidatePath("/informacoes-bag");

  return {
    status: "success",
    message: "Cidade atualizada com sucesso.",
  };
}

export async function deleteTenantCityAction(
  _prevState: CompanyProfileActionState,
  formData: FormData,
): Promise<CompanyProfileActionState> {
  const actor = await requireSettingsAccess();
  const tenantId = actor.current_tenant.id;
  const id = String(formData.get("id") || "");

  if (!id) {
    return { status: "error", message: "Cidade invalida." };
  }

  const [{ count: hotZonesCount, error: hotZonesError }, { count: couriersCount, error: couriersError }] =
    await Promise.all([
      supabaseServer
        .from("tenant_regions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("city_id", id)
        .eq("is_active", true),
      supabaseServer
        .from("bag_couriers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("city_id", id),
    ]);

  const dependencyError = hotZonesError || couriersError;

  if (dependencyError) {
    if (isCompanyAccessSchemaMissing(dependencyError)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return { status: "error", message: dependencyError.message };
  }

  if ((hotZonesCount || 0) > 0) {
    return {
      status: "error",
      message: "Exclua ou mova as Hot Zones dessa cidade antes de remover a cidade.",
    };
  }

  if ((couriersCount || 0) > 0) {
    return {
      status: "error",
      message: "Essa cidade ja esta vinculada a entregadores e nao pode ser excluida agora.",
    };
  }

  const { error } = await supabaseServer
    .from("tenant_cities")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return { status: "error", message: error.message };
  }

  revalidatePath("/perfil-empresa");
  revalidatePath("/informacoes-bag");

  return {
    status: "success",
    message: "Cidade excluida com sucesso.",
  };
}

export async function updateTenantHotZoneAction(
  _prevState: CompanyProfileActionState,
  formData: FormData,
): Promise<CompanyProfileActionState> {
  const actor = await requireSettingsAccess();
  const tenantId = actor.current_tenant.id;
  const id = String(formData.get("id") || "");
  const name = normalizeText(String(formData.get("name") || ""));

  if (!id) {
    return { status: "error", message: "Hot Zone invalida." };
  }

  if (name.length < 2) {
    return { status: "error", message: "Digite um nome valido para a Hot Zone." };
  }

  const { error } = await supabaseServer
    .from("tenant_regions")
    .update({ name })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return {
      status: "error",
      message: messageFromError(error, "Nao foi possivel atualizar a Hot Zone."),
    };
  }

  revalidatePath("/perfil-empresa");
  revalidatePath("/informacoes-bag");

  return {
    status: "success",
    message: "Hot Zone atualizada com sucesso.",
  };
}

export async function deleteTenantHotZoneAction(
  _prevState: CompanyProfileActionState,
  formData: FormData,
): Promise<CompanyProfileActionState> {
  const actor = await requireSettingsAccess();
  const tenantId = actor.current_tenant.id;
  const id = String(formData.get("id") || "");

  if (!id) {
    return { status: "error", message: "Hot Zone invalida." };
  }

  const { data: zoneData, error: zoneError } = await supabaseServer
    .from("tenant_regions")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (zoneError) {
    if (isCompanyAccessSchemaMissing(zoneError)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return { status: "error", message: zoneError.message };
  }

  if (!zoneData) {
    return { status: "error", message: "Hot Zone nao encontrada." };
  }

  const { count, error: usageError } = await supabaseServer
    .from("bag_courier_regions")
    .select("id", { count: "exact", head: true })
    .eq("region_id", id);

  if (usageError) {
    if (isCompanyAccessSchemaMissing(usageError)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return { status: "error", message: usageError.message };
  }

  if ((count || 0) > 0) {
    return {
      status: "error",
      message: "Essa Hot Zone ja esta vinculada a entregadores e nao pode ser excluida agora.",
    };
  }

  const { error } = await supabaseServer
    .from("tenant_regions")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { status: "error", message: settingsSchemaMessage };
    }

    return { status: "error", message: error.message };
  }

  revalidatePath("/perfil-empresa");
  revalidatePath("/informacoes-bag");

  return {
    status: "success",
    message: "Hot Zone excluida com sucesso.",
  };
}
