import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

let browserClient: SupabaseClient | null = null;

/**
 * Browser Supabase client. Call only after env vars are configured.
 * Throws a clear error if placeholders are still missing.
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  const env = getSupabasePublicEnv();

  if (!env) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  if (!browserClient) {
    browserClient = createClient(env.url, env.anonKey);
  }

  return browserClient;
}
