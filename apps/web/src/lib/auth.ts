import { redirect } from "next/navigation";

import { supabaseServer } from "@/lib/supabase-server";
import { createSupabaseAuthClient } from "@/lib/supabase-auth";

export type AppRole = "owner" | "area";

export type AppUser = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  can_access_waitlist: boolean;
  is_active: boolean;
};

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabaseAuth = await createSupabaseAuthClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user?.id || !user.email) {
    return null;
  }

  const { data, error } = await supabaseServer
    .from("app_users")
    .select("id,email,full_name,role,can_access_waitlist,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    return null;
  }

  return data as AppUser;
}

export async function requireAppUser() {
  const user = await getCurrentAppUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireWaitlistAccess() {
  const user = await requireAppUser();

  if (!user.can_access_waitlist) {
    redirect("/login?error=sem_permissao");
  }

  return user;
}

export async function requireOwner() {
  const user = await requireAppUser();

  if (user.role !== "owner") {
    redirect("/?error=sem_permissao_owner");
  }

  return user;
}

export async function ownerExists() {
  const { count, error } = await supabaseServer
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return (count || 0) > 0;
}
