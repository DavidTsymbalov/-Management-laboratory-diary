export type SupabasePublicEnv = {
  url: string;
  anonKey: string;
};

/**
 * Reads public Supabase env vars. Returns null when they are missing
 * so the UI can show a setup state instead of crashing at import time.
 */
export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicEnv() !== null;
}
