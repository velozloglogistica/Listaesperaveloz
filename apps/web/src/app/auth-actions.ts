"use server";

import { redirect } from "next/navigation";

import { requireOwner, ownerExists } from "@/lib/auth";
import { createSupabaseAuthClient } from "@/lib/supabase-auth";
import { supabaseServer } from "@/lib/supabase-server";

export type UserManagementActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function validPassword(value: string) {
  return value.length >= 8;
}

export async function signInAction(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") || ""));
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    redirect("/login?error=credenciais_obrigatorias");
  }

  const supabaseAuth = await createSupabaseAuthClient();
  const { error } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/login?error=login_invalido");
  }

  redirect("/");
}

export async function signOutAction() {
  const supabaseAuth = await createSupabaseAuthClient();
  await supabaseAuth.auth.signOut();
  redirect("/login");
}

export async function bootstrapOwnerAction(formData: FormData) {
  const alreadyExists = await ownerExists();

  if (alreadyExists) {
    redirect("/login?error=owner_ja_existe");
  }

  const fullName = String(formData.get("full_name") || "").trim();
  const email = normalizeEmail(String(formData.get("email") || ""));
  const password = String(formData.get("password") || "");

  if (fullName.length < 5 || !email || !validPassword(password)) {
    redirect("/login?error=dados_bootstrap_invalidos");
  }

  const { data, error } = await supabaseServer.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (error || !data.user) {
    redirect("/login?error=erro_ao_criar_owner");
  }

  const { error: profileError } = await supabaseServer.from("app_users").insert({
    id: data.user.id,
    email,
    full_name: fullName,
    role: "owner",
    can_access_waitlist: true,
    is_active: true,
    created_by: data.user.id,
  });

  if (profileError) {
    await supabaseServer.auth.admin.deleteUser(data.user.id);
    redirect("/login?error=erro_ao_salvar_owner");
  }

  const supabaseAuth = await createSupabaseAuthClient();
  await supabaseAuth.auth.signInWithPassword({ email, password });

  redirect("/");
}

export async function createDashboardUserAction(
  _prevState: UserManagementActionState,
  formData: FormData,
): Promise<UserManagementActionState> {
  const owner = await requireOwner();
  const fullName = String(formData.get("full_name") || "").trim();
  const email = normalizeEmail(String(formData.get("email") || ""));
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "area");
  const canAccessWaitlist = String(formData.get("can_access_waitlist") || "") === "on";

  if (fullName.length < 5) {
    return { status: "error", message: "Digite um nome valido para o usuario." };
  }

  if (!email.includes("@")) {
    return { status: "error", message: "Digite um email valido." };
  }

  if (!validPassword(password)) {
    return { status: "error", message: "A senha precisa ter pelo menos 8 caracteres." };
  }

  if (role !== "owner" && role !== "area") {
    return { status: "error", message: "Perfil invalido." };
  }

  const { data, error } = await supabaseServer.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (error || !data.user) {
    return {
      status: "error",
      message: error?.message || "Nao foi possivel criar o login.",
    };
  }

  const { error: insertError } = await supabaseServer.from("app_users").insert({
    id: data.user.id,
    email,
    full_name: fullName,
    role,
    can_access_waitlist: canAccessWaitlist,
    is_active: true,
    created_by: owner.id,
  });

  if (insertError) {
    await supabaseServer.auth.admin.deleteUser(data.user.id);
    return {
      status: "error",
      message: insertError.message,
    };
  }

  redirect("/?created=user");
}
