"use client";
import { getSupabase } from "@/lib/supabase";
export type SecurityAccount = {
  id: string;
  name: string;
  login: string;
  role: "teacher" | "student" | "admin" | "csa";
  disabled: boolean;
  mfa: boolean;
};
export type SecurityEvent = {
  id: number;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  target_id: string | null;
  target_name: string | null;
  details: Record<string, unknown>;
  session_id: string | null;
  device: string | null;
  ip: string | null;
  created_at: string;
};
export type SecurityDevice = {
  id: string;
  created_at: string;
  updated_at: string;
  device: string | null;
  ip: string | null;
  current: boolean;
  revoked: boolean;
};
export const SECURITY_ACTIONS: Record<string, string> = {
  auth_login: "Успешный вход",
  auth_password_changed: "Изменение пароля в Auth",
  auth_identity_changed: "Изменение адреса входа",
  points: "Изменение баллов",
  achievement: "Выдача награды",
  achievement_revoked: "Отзыв награды",
  create: "Создание ученика",
  delete: "Удаление ученика",
  password_read: "Просмотр пароля",
  password_reset: "Смена пароля",
  mfa_reset: "Сброс 2FA",
  mfa_enabled: "Включение 2FA",
  csa_mfa_disabled: "Вход CSA без 2FA",
  mfa_factor_removed: "Удаление фактора 2FA",
  session_revoked: "Завершение сессии",
  account_disabled: "Блокировка аккаунта",
  account_enabled: "Разблокировка аккаунта",
  account_deleted: "Удаление аккаунта",
  staff_created: "Создание сотрудника",
  staff_create: "Создание сотрудника (запрос)",
  csa_granted: "Назначение CSA",
  admin_grant: "Назначение администратора",
  admin_revoke: "Снятие прав администратора",
  admin_limits: "Изменение ограничений",
  profile_changed: "Изменение профиля",
  reactions_changed: "Изменение эмодзи",
  homework_create: "Публикация ДЗ",
  homework_edit: "Редактирование ДЗ",
  homework_archive: "ДЗ в архиве",
  homework_restore: "Восстановление ДЗ",
  lesson_create: "Создание занятия",
  lesson_cancel: "Отмена занятия",
  lesson_restore: "Восстановление занятия",
  attendance_mark: "Изменение посещаемости",
};
export async function loadSecurityAccounts(): Promise<SecurityAccount[]> {
  const { data, error } = await getSupabase().rpc("security_accounts");
  if (error) throw error;
  return data ?? [];
}
export async function loadSecurityEvents(
  filters: { actor: string; target: string; action: string },
  before: number | null = null,
): Promise<SecurityEvent[]> {
  const { data, error } = await getSupabase().rpc("list_security_events", {
    before_id: before,
    actor_filter: filters.actor || null,
    target_filter: filters.target || null,
    action_filter: filters.action || null,
  });
  if (error) throw error;
  return (data ?? []).map((event: SecurityEvent) => ({
    ...event,
    id: Number(event.id),
  }));
}
export async function loadSecurityDevices(
  id: string,
): Promise<SecurityDevice[]> {
  const { data, error } = await getSupabase().rpc("list_security_sessions", {
    target_user: id,
  });
  if (error) throw error;
  return data ?? [];
}
export async function revokeSecurityDevice(id: string) {
  const { error } = await getSupabase().rpc("revoke_security_session", {
    target_session: id,
  });
  if (error) throw error;
}
export async function setSecurityAccount(id: string, enabled: boolean) {
  const { error } = await getSupabase().rpc("csa_account_enabled", {
    target_user: id,
    enabled,
  });
  if (error) throw error;
}
export async function invokeSecurityAdmin(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) throw new Error("Войдите в CSA.");
  const { data, error } = await getSupabase().functions.invoke(
    "security-admin",
    { body, headers: { Authorization: `Bearer ${session.access_token}` } },
  );
  if (error) {
    if (error.context instanceof Response) {
      const result = await error.context.json().catch(() => null);
      if (result?.error) throw new Error(result.error);
    }
    throw error;
  }
  return data;
}
export function deviceDescription(value: string | null) {
  if (!value) return "Сессия без описания устройства";
  const browser = /Edg\//.test(value)
    ? "Edge"
    : /Firefox\//.test(value)
      ? "Firefox"
      : /Chrome\//.test(value)
        ? "Chrome"
        : /Safari\//.test(value)
          ? "Safari"
          : "Браузер";
  const os = /Android/.test(value)
    ? "Android"
    : /iPhone|iPad/.test(value)
      ? "iOS"
      : /Windows/.test(value)
        ? "Windows"
        : /Macintosh|Mac OS/.test(value)
          ? "macOS"
          : /Linux/.test(value)
            ? "Linux"
            : "ОС не указана";
  return `${browser}, ${os}`;
}
