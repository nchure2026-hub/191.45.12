import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only privileged client. Never expose this key to the browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not configured on the server.");
  }
  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
