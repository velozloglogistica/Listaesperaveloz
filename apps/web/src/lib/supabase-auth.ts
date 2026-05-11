import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!url) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL nao configurado.");
}

if (!anonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY nao configurado.");
}

export async function createSupabaseAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components may call auth helpers in a read-only cookies context.
        }
      },
    },
  });
}
