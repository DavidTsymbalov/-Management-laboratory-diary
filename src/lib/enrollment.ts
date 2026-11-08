"use client";

import { getSupabase, cloudError } from "@/lib/supabase";

export type EnrollmentRequest = {
  id: string;
  first_name: string;
  last_name: string;
  telegram: string;
  created_at: string;
};

export function normalizeTelegram(value: string) {
  return value.trim().replace(/^(?:https?:\/\/)?t\.me\//i, "").replace(/^@/, "").toLowerCase();
}

export function enrollmentError(error: unknown) {
  const message = cloudError(error);
  if (/сервис ещё не настроен/i.test(message))
    return "Приём заявок пока не включён. Попробуйте позже.";
  return message;
}

export async function submitEnrollment(firstName: string, lastName: string, telegram: string, website: string) {
  const { error } = await getSupabase().rpc("submit_enrollment_request", {
    given_name: firstName.trim(),
    family_name: lastName.trim(),
    telegram_username: normalizeTelegram(telegram),
    website,
  });
  if (error) throw error;
}

export async function loadEnrollments(query: string, offset: number) {
  const { data, error } = await getSupabase().rpc("list_enrollment_requests", {
    query_text: query.trim(),
    page_offset: offset,
  });
  if (error) throw error;
  return data as { items: EnrollmentRequest[]; total: number };
}
