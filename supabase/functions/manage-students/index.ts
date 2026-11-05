import { createClient } from "npm:@supabase/supabase-js@2";

// Keep identity normalization and hashes equivalent to src/lib/student-identity.ts.
function normalizeName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}
async function emailFor(name: string, role: "student" | "admin" = "student") {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeName(name)));
  const hex = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
  return role === "admin" ? `a-${hex.slice(0, 48)}@admins.management-laboratory.invalid` :
    `s-${hex.slice(0, 48)}@students.management-laboratory.invalid`;
}

function missingAdministratorsTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

type AchievementInput = { title: string; icon?: string; earnedAt?: string };
type StudentInput = { name: string; password: string; nuts?: number; achievements?: AchievementInput[] };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Метод не поддерживается." }, 405);
  try {
    const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply({ error: "Сессия истекла. Войдите снова." }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // This check is mandatory even when the gateway's legacy verify_jwt is disabled.
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return reply({ error: "Сессия истекла. Войдите снова." }, 401);
    const teacher = await admin.from("teachers").select("user_id").eq("user_id", user.id).maybeSingle();
    if (teacher.error) throw teacher.error;
    const isTeacher = Boolean(teacher.data);
    if (!isTeacher) {
      const staff = await admin.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
      if (staff.error && !missingAdministratorsTable(staff.error)) throw staff.error;
      if (!staff.data) return reply({ error: "Действие доступно только учителю или администратору." }, 403);
    }

    const raw = await req.text();
    if (raw.length > 200000) return reply({ error: "Слишком большой запрос." }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Некорректный запрос." }, 400);

    if (body.action === "create-admin" || body.action === "password-admin" || body.action === "delete-admin") {
      // Never derive this permission from user metadata, a request role or an admin's own profile.
      if (!isTeacher) return reply({ error: "Только учитель может управлять администраторами." }, 403);
      if (body.action === "create-admin") {
        const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/gu, " ") : "";
        const login = typeof body.login === "string" ? normalizeName(body.login) : "";
        if (name.length < 1 || name.length > 200 || !/^[\p{L}\p{N}._-]{3,80}$/u.test(login)) {
          return reply({ error: "Укажите имя до 200 символов и логин от 3 до 80 символов: буквы, цифры, точка, дефис или подчёркивание." }, 400);
        }
        if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
          return reply({ error: "Пароль должен содержать от 8 до 128 символов." }, 400);
        }
        const existing = await admin.from("admins").select("user_id").eq("login_name", login).maybeSingle();
        if (missingAdministratorsTable(existing.error)) {
          return reply({ error: "Управление администраторами ещё не подключено. Выполните обновление базы Supabase." }, 503);
        }
        if (existing.error) throw existing.error;
        if (existing.data) return reply({ error: "Администратор с таким логином уже существует." }, 409);
        const account = await admin.auth.admin.createUser({
          email: await emailFor(login, "admin"), password: body.password, email_confirm: true,
        });
        if (account.error || !account.data.user) {
          return reply({ error: "Не удалось создать аккаунт. Возможно, этот логин уже занят." }, 409);
        }
        const saved = await admin.rpc("provision_administrator", {
          administrator_id: account.data.user.id, administrator_name: name,
          administrator_login: login, teacher_id: user.id,
        });
        // PostgREST can wrap a table composite in an array; accept the single
        // created row in either representation, never return undefined credentials.
        const profile = Array.isArray(saved.data) ? saved.data[0] : saved.data;
        if (saved.error || !profile || profile.user_id !== account.data.user.id) {
          const cleanup = await admin.auth.admin.deleteUser(account.data.user.id);
          if (cleanup.error) console.error("Provision rollback failed for user", account.data.user.id);
          return reply({ error: "Не удалось сохранить администратора. Проверьте обновление базы и повторите попытку." }, 500);
        }
        return reply({ administrator: {
          id: profile.user_id, name: profile.name, login: profile.login_name,
          createdAt: profile.created_at,
        } });
      }
      if (typeof body.id !== "string") return reply({ error: "Не выбран администратор." }, 400);
      const target = await admin.from("admins").select("user_id").eq("user_id", body.id).maybeSingle();
      if (target.error) throw target.error;
      if (!target.data) return reply({ error: "Администратор не найден." }, 404);
      const targetTeacher = await admin.from("teachers").select("user_id").eq("user_id", body.id).maybeSingle();
      if (targetTeacher.error) throw targetTeacher.error;
      if (targetTeacher.data) return reply({ error: "Нельзя изменить аккаунт учителя." }, 403);
      if (body.action === "password-admin") {
        if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
          return reply({ error: "Пароль должен содержать от 8 до 128 символов." }, 400);
        }
        const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
        if (error) throw error;
      } else {
        const { error } = await admin.auth.admin.deleteUser(body.id);
        if (error) throw error;
      }
      return reply({ ok: true });
    }

    if (body.action === "create") {
      if (!Array.isArray(body.students) || body.students.length < 1 || body.students.length > 30) {
        return reply({ error: "Добавляйте от 1 до 30 учеников за раз." }, 400);
      }
      const created: string[] = [];
      const errors: string[] = [];
      for (const input of body.students as StudentInput[]) {
        const name = typeof input?.name === "string" ? input.name.trim().replace(/\s+/gu, " ") : "";
        const password = input?.password;
        if (name.length < 1 || name.length > 200 || typeof password !== "string" || password.length < 8 || password.length > 128) {
          errors.push(`${name || "Ученик"}: ФИО до 200 символов, пароль от 8 до 128 символов.`);
          continue;
        }
        const nuts = input.nuts ?? 0;
        if (!Number.isInteger(nuts) || nuts < 0 || nuts > 1000000000 ||
          (input.achievements !== undefined && !Array.isArray(input.achievements))) {
          errors.push(`${name}: некорректные баллы или ачивки.`);
          continue;
        }
        const login = normalizeName(name);
        const existing = await admin.from("students").select("id").eq("login_name", login).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) { errors.push(`${name}: уже есть в классе.`); continue; }
        const account = await admin.auth.admin.createUser({
          email: await emailFor(name), password, email_confirm: true,
        });
        if (account.error || !account.data.user) {
          errors.push(`${name}: ${account.error?.message ?? "не удалось создать аккаунт"}`);
          continue;
        }
        const saved = await admin.rpc("provision_student", {
          student_id: account.data.user.id, student_name: name, student_login: login,
          initial_nuts: nuts, initial_achievements: input.achievements ?? [],
        });
        if (saved.error) {
          const cleanup = await admin.auth.admin.deleteUser(account.data.user.id);
          if (cleanup.error) console.error("Provision rollback failed for user", account.data.user.id);
          errors.push(`${name}: не удалось сохранить ученика. Проверьте данные и повторите попытку.`);
        } else created.push(name);
      }
      return reply({ created, errors });
    }

    if (body.action === "password" || body.action === "delete") {
      if (typeof body.id !== "string") return reply({ error: "Не выбран ученик." }, 400);
      const student = await admin.from("students").select("id").eq("id", body.id).maybeSingle();
      if (student.error) throw student.error;
      // Restrict operations to pupils, even if a trusted operator accidentally assigned two roles.
      if (!student.data) return reply({ error: "Ученик не найден." }, 404);
      const alsoTeacher = await admin.from("teachers").select("user_id").eq("user_id", body.id).maybeSingle();
      if (alsoTeacher.error) throw alsoTeacher.error;
      const alsoAdmin = await admin.from("admins").select("user_id").eq("user_id", body.id).maybeSingle();
      if (alsoAdmin.error && !missingAdministratorsTable(alsoAdmin.error)) throw alsoAdmin.error;
      if (alsoTeacher.data || alsoAdmin.data) return reply({ error: "Нельзя изменить аккаунт сотрудника через список учеников." }, 403);
      if (body.action === "password") {
        if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
          return reply({ error: "Пароль должен содержать от 8 до 128 символов." }, 400);
        }
        const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
        if (error) throw error;
      } else {
        // Cascades to the profile and achievements in the database.
        const { error } = await admin.auth.admin.deleteUser(body.id);
        if (error) throw error;
      }
      return reply({ ok: true });
    }
    return reply({ error: "Неизвестное действие." }, 400);
  } catch (error) {
    console.error("manage-students failed", error instanceof Error ? error.message : "database error");
    return reply({ error: "Операция не выполнена. Проверьте настройки базы и повторите попытку." }, 500);
  }
});
