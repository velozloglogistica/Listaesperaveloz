import { supabaseServer } from "@/lib/supabase-server";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  is_active: boolean;
};

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || "velozlog";

export async function getDefaultTenant(): Promise<Tenant> {
  const { data, error } = await supabaseServer
    .from("tenants")
    .select("id,name,slug,timezone,is_active")
    .eq("slug", DEFAULT_TENANT_SLUG)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(`Tenant padrao nao encontrado: ${DEFAULT_TENANT_SLUG}`);
  }

  return data as Tenant;
}
