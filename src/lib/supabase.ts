"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Publishable credentials are intended for browsers. RLS protects the database.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://pnpanexhudlalavcevck.supabase.co";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ICc6feuKcBqWFJF54Psv3Q_L0k7oHcp";

let client: SupabaseClient | undefined;
export function getSupabase() {
  client ??= createClient(SUPABASE_URL, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export function cloudError(error: unknown): string {
  const message = error instanceof Error ? error.message :
    typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  if (/invalid login credentials/i.test(message)) return "Неверный логин или пароль.";
  if (/Could not find the (table|function)|relation .+ does not exist/i.test(message)) return "Сервис ещё не настроен. Обратитесь к учителю.";
  if (/fetch|network|timeout/i.test(message)) return "Не удалось связаться с базой. Проверьте интернет и повторите попытку.";
  if (/JWT|refresh token|session missing/i.test(message)) return "Сессия истекла. Войдите снова.";
  return message || "Не удалось выполнить операцию. Повторите попытку.";
}
