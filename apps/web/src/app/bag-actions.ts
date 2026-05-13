"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  BAG_SHIFT_OPTIONS,
  BAG_VEHICLE_OPTIONS,
  BAG_WEEKDAY_OPTIONS,
  type BagShift,
  type BagStatus,
  type BagVehicle,
  type BagWeekday,
} from "@/lib/bag-config";
import { canAccessModule, requireAppUser, requireSettingsAccess } from "@/lib/auth";
import { isCompanyAccessSchemaMissing } from "@/lib/company-access";
import { supabaseServer } from "@/lib/supabase-server";

export type BagActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const bagSchemaMessage =
  "Falta rodar a migration do modulo BAG. Execute supabase/add_bag_information_module.sql.";

const allowedVehicles = new Set<BagVehicle>(BAG_VEHICLE_OPTIONS.map((option) => option.value));
const allowedShifts = new Set<BagShift>(BAG_SHIFT_OPTIONS.map((option) => option.value));
const allowedWeekdays = new Set<BagWeekday>(BAG_WEEKDAY_OPTIONS.map((option) => option.value));

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

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

async function requireBagInfoAccess() {
  const actor = await requireAppUser();

  if (!canAccessModule(actor, "bag_info")) {
    redirect("/?error=sem_permissao_bag");
  }

  return actor;
}

async function getTenantAllowedBagStatuses(tenantId: string) {
  const { data, error } = await supabaseServer
    .from("tenant_bag_statuses")
    .select("slug")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  return new Set((data || []).map((item) => item.slug as BagStatus));
}

export async function createTenantCityAction(
  _prevState: BagActionState,
  formData: FormData,
): Promise<BagActionState> {
  const actor = await requireSettingsAccess();
  const tenantId = actor.current_tenant.id;
  const name = normalizeText(String(formData.get("name") || ""));

  if (name.length < 2) {
    return { status: "error", message: "Digite um nome valido para a cidade." };
  }

  const { error } = await supabaseServer.from("tenant_cities").insert({
    tenant_id: tenantId,
    name,
    is_active: true,
    created_by: actor.id,
  });

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { status: "error", message: bagSchemaMessage };
    }

    return {
      status: "error",
      message: messageFromError(error, "Essa cidade ja esta cadastrada para a empresa."),
    };
  }

  revalidatePath("/informacoes-bag");
  revalidatePath("/perfil-empresa");

  return {
    status: "success",
    message: "Cidade cadastrada com sucesso.",
  };
}

export async function createTenantRegionAction(
  _prevState: BagActionState,
  formData: FormData,
): Promise<BagActionState> {
  const actor = await requireSettingsAccess();
  const tenantId = actor.current_tenant.id;
  const cityId = String(formData.get("city_id") || "");
  const name = normalizeText(String(formData.get("name") || ""));

  if (!cityId) {
    return { status: "error", message: "Selecione a cidade dessa Hot Zone." };
  }

  if (name.length < 2) {
    return { status: "error", message: "Digite um nome valido para a Hot Zone." };
  }

  const { data: cityData, error: cityError } = await supabaseServer
    .from("tenant_cities")
    .select("id")
    .eq("id", cityId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (cityError) {
    if (isCompanyAccessSchemaMissing(cityError)) {
      return { status: "error", message: bagSchemaMessage };
    }

    return { status: "error", message: cityError.message };
  }

  if (!cityData) {
    return { status: "error", message: "Cidade invalida para essa Hot Zone." };
  }

  const { error } = await supabaseServer.from("tenant_regions").insert({
    tenant_id: tenantId,
    city_id: cityId,
    name,
    is_active: true,
    created_by: actor.id,
  });

  if (error) {
    if (isCompanyAccessSchemaMissing(error)) {
      return { status: "error", message: bagSchemaMessage };
    }

    return {
      status: "error",
      message: messageFromError(error, "Essa Hot Zone ja esta cadastrada para essa cidade."),
    };
  }

  revalidatePath("/informacoes-bag");
  revalidatePath("/perfil-empresa");

  return {
    status: "success",
    message: "Hot Zone cadastrada com sucesso.",
  };
}

export async function createBagCourierAction(
  _prevState: BagActionState,
  formData: FormData,
): Promise<BagActionState> {
  const actor = await requireBagInfoAccess();
  const tenantId = actor.current_tenant.id;

  const partnerDeliveryId = normalizeText(String(formData.get("partner_delivery_id") || ""));
  const fullName = normalizeText(String(formData.get("full_name") || ""));
  const phoneNumber = sanitizeDigits(String(formData.get("phone_number") || ""));
  const whatsappWebLink = normalizeText(String(formData.get("whatsapp_web_link") || ""));
  const identityNumber = normalizeText(String(formData.get("identity_number") || ""));
  const cityId = String(formData.get("city_id") || "");
  const deliveryVehicle = String(formData.get("delivery_vehicle") || "") as BagVehicle;
  const operatorUserId = String(formData.get("operator_user_id") || "");
  const joinedTelegramGroup = String(formData.get("joined_telegram_group") || "") === "on";
  const selectedRegionIds = Array.from(
    new Set(
      formData
        .getAll("region_ids")
        .map((value) => String(value))
        .filter(Boolean),
    ),
  );
  const preferredShifts = Array.from(
    new Set(
      formData
        .getAll("preferred_shifts")
        .map((value) => String(value) as BagShift)
        .filter((value) => allowedShifts.has(value)),
    ),
  );
  const preferredWeekdays = Array.from(
    new Set(
      formData
        .getAll("preferred_weekdays")
        .map((value) => String(value) as BagWeekday)
        .filter((value) => allowedWeekdays.has(value)),
    ),
  );
  const observation = normalizeText(String(formData.get("observation") || ""));
  const bagStatus = String(formData.get("bag_status") || "") as BagStatus;
  let allowedStatuses: Set<BagStatus>;

  try {
    allowedStatuses = await getTenantAllowedBagStatuses(tenantId);
  } catch (error) {
    if (isCompanyAccessSchemaMissing(error as { message?: string })) {
      return { status: "error", message: bagSchemaMessage };
    }

    return {
      status: "error",
      message: (error as { message?: string })?.message || "Nao foi possivel validar os status de BAG.",
    };
  }

  if (!partnerDeliveryId) {
    return { status: "error", message: "Informe o ID do entregador parceiro." };
  }

  if (fullName.length < 3) {
    return { status: "error", message: "Digite o nome do entregador." };
  }

  if (phoneNumber.length < 10 || phoneNumber.length > 13) {
    return { status: "error", message: "Telefone invalido. Confira DDD e numero." };
  }

  if (!cityId) {
    return { status: "error", message: "Selecione a cidade do entregador." };
  }

  if (!allowedVehicles.has(deliveryVehicle)) {
    return { status: "error", message: "Escolha um veiculo valido." };
  }

  if (!operatorUserId) {
    return { status: "error", message: "Selecione o operador responsavel." };
  }

  if (selectedRegionIds.length === 0) {
    return { status: "error", message: "Selecione pelo menos uma Hot Zone desejada." };
  }

  if (preferredShifts.length === 0) {
    return { status: "error", message: "Selecione pelo menos um turno." };
  }

  if (preferredWeekdays.length === 0) {
    return { status: "error", message: "Selecione pelo menos um dia da semana." };
  }

  if (!allowedStatuses.has(bagStatus)) {
    return { status: "error", message: "Escolha um status de BAG valido." };
  }

  const [
    { data: cityData, error: cityError },
    { data: operatorData, error: operatorError },
    { data: regionsData, error: regionsError },
  ] = await Promise.all([
    supabaseServer
      .from("tenant_cities")
      .select("id")
      .eq("id", cityId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle(),
    supabaseServer
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", operatorUserId)
      .eq("is_active", true)
      .maybeSingle(),
    supabaseServer
      .from("tenant_regions")
      .select("id,city_id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .in("id", selectedRegionIds),
  ]);

  const dependencyError = cityError || operatorError || regionsError;

  if (dependencyError) {
    if (isCompanyAccessSchemaMissing(dependencyError)) {
      return { status: "error", message: bagSchemaMessage };
    }

    return { status: "error", message: dependencyError.message };
  }

  if (!cityData) {
    return { status: "error", message: "Cidade invalida para esse cadastro." };
  }

  if (!operatorData) {
    return { status: "error", message: "Operador invalido para essa empresa." };
  }

  if (
    (regionsData || []).length !== selectedRegionIds.length ||
    (regionsData || []).some((region) => region.city_id !== cityId)
  ) {
    return {
      status: "error",
      message: "As Hot Zones precisam pertencer a cidade escolhida.",
    };
  }

  const { data: courierData, error: courierError } = await supabaseServer
    .from("bag_couriers")
    .insert({
      tenant_id: tenantId,
      partner_delivery_id: partnerDeliveryId,
      full_name: fullName,
      phone_number: phoneNumber,
      whatsapp_web_link: whatsappWebLink || null,
      identity_number: identityNumber || null,
      city_id: cityId,
      delivery_vehicle: deliveryVehicle,
      operator_user_id: operatorUserId,
      joined_telegram_group: joinedTelegramGroup,
      preferred_shifts: preferredShifts,
      preferred_weekdays: preferredWeekdays,
      observation: observation || null,
      bag_status: bagStatus,
    })
    .select("id")
    .single();

  if (courierError || !courierData) {
    if (isCompanyAccessSchemaMissing(courierError)) {
      return { status: "error", message: bagSchemaMessage };
    }

    return {
      status: "error",
      message: messageFromError(courierError, "Nao foi possivel cadastrar o entregador."),
    };
  }

  const { error: regionsLinkError } = await supabaseServer.from("bag_courier_regions").insert(
    selectedRegionIds.map((regionId) => ({
      bag_courier_id: courierData.id,
      region_id: regionId,
    })),
  );

  if (regionsLinkError) {
    await supabaseServer.from("bag_couriers").delete().eq("id", courierData.id).eq("tenant_id", tenantId);

    if (isCompanyAccessSchemaMissing(regionsLinkError)) {
      return { status: "error", message: bagSchemaMessage };
    }

    return { status: "error", message: regionsLinkError.message };
  }

  revalidatePath("/informacoes-bag");

  return {
    status: "success",
    message: "Entregador cadastrado com sucesso.",
  };
}

export async function updateBagCourierStatus(formData: FormData) {
  const actor = await requireBagInfoAccess();
  const tenantId = actor.current_tenant.id;
  const id = String(formData.get("id") || "");
  const bagStatus = String(formData.get("bag_status") || "") as BagStatus;
  const allowedStatuses = await getTenantAllowedBagStatuses(tenantId);

  if (!id || !allowedStatuses.has(bagStatus)) {
    throw new Error("Dados invalidos para atualizar o status do BAG.");
  }

  const { error } = await supabaseServer
    .from("bag_couriers")
    .update({ bag_status: bagStatus })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/informacoes-bag");
}
