import { createClient } from "npm:@supabase/supabase-js@2";

// Keep these two helpers equivalent to src/lib/student-identity.ts.
function normalizeName(name: string) {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("ru-RU");
}
async function emailFor(name: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizeName(name)),
  );
  const hex = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `s-${hex.slice(0, 48)}@students.management-laboratory.invalid`;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

type AchievementInput = { title: string; icon?: string; earnedAt?: string };
type StudentInput = {
  name: string;
  password: string;
  nuts?: number;
  achievements?: AchievementInput[];
};

// Credentials are encrypted only on the server. No secret or cleartext is stored in the browser bundle.
// Derivation uses the existing service secret; rotate stored credentials when rotating that secret.
async function credentialKey() {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Missing server credential key");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`classroom-credentials-v1:${secret}`),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function unhex(value: string) {
  if (!/^(?:[0-9a-f]{2})+$/.test(value))
    throw new Error("Invalid credential envelope");
  return Uint8Array.from(value.match(/../g)!, (b) => parseInt(b, 16));
}
async function encryptPassword(password: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await credentialKey(),
    new TextEncoder().encode(password),
  );
  return `v1:${hex(iv)}:${hex(new Uint8Array(data))}`;
}
async function decryptPassword(envelope: string) {
  const [version, iv, data] = envelope.split(":");
  if (version !== "v1") throw new Error("Unknown credential version");
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unhex(iv) },
    await credentialKey(),
    unhex(data),
  );
  return new TextDecoder().decode(clear);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return reply({ error: "Метод не поддерживается." }, 405);
  try {
    const token = req.headers
      .get("Authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply({ error: "Войдите в кабинет учителя." }, 401);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    // This check is mandatory even when the gateway's legacy verify_jwt is disabled.
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);
    if (authError || !user)
      return reply({ error: "Сессия истекла. Войдите снова." }, 401);
    const teacher = await admin
      .from("teachers")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (teacher.error) throw teacher.error;
    const isTeacher = Boolean(teacher.data);
    if (!isTeacher) {
      const assigned = await admin
        .from("student_administrators")
        .select("student_id")
        .eq("student_id", user.id)
        .maybeSingle();
      if (assigned.error) throw assigned.error;
      if (!assigned.data)
        return reply(
          {
            error:
              "Действие доступно только преподавателю или назначенному администратору.",
          },
          403,
        );
    }

    const raw = await req.text();
    if (raw.length > 200000)
      return reply({ error: "Слишком большой запрос." }, 413);
    const body = JSON.parse(raw);

    if (body.action === "view_password") {
      if (!isTeacher)
        return reply({ error: "Пароли доступны только преподавателю." }, 403);
      if (typeof body.id !== "string")
        return reply({ error: "Выберите ученика." }, 400);
      const saved = await admin
        .from("student_credentials")
        .select("ciphertext")
        .eq("student_id", body.id)
        .maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data?.ciphertext)
        return reply(
          {
            error:
              "Старый пароль не сохранён. Задайте новый — после этого его можно будет посмотреть.",
          },
          404,
        );
      try {
        return reply({
          password: await decryptPassword(saved.data.ciphertext),
        });
      } catch {
        return reply(
          {
            error:
              "Не удалось расшифровать пароль. Задайте ученику новый пароль.",
          },
          409,
        );
      }
    }
    if (body.action === "create") {
      if (
        !Array.isArray(body.students) ||
        body.students.length < 1 ||
        body.students.length > 30
      ) {
        return reply({ error: "Добавляйте от 1 до 30 учеников за раз." }, 400);
      }
      const created: string[] = [];
      const errors: string[] = [];
      for (const input of body.students as StudentInput[]) {
        const name =
          typeof input?.name === "string"
            ? input.name.trim().replace(/\s+/gu, " ")
            : "";
        const password = input?.password;
        if (
          name.length < 1 ||
          name.length > 200 ||
          typeof password !== "string" ||
          password.length < 8 ||
          password.length > 128
        ) {
          errors.push(
            `${name || "Ученик"}: ФИО до 200 символов, пароль от 8 до 128 символов.`,
          );
          continue;
        }
        const nuts = input.nuts ?? 0;
        if (
          !Number.isInteger(nuts) ||
          nuts < 0 ||
          nuts > 1000000000 ||
          (input.achievements !== undefined &&
            !Array.isArray(input.achievements))
        ) {
          errors.push(`${name}: некорректные баллы или ачивки.`);
          continue;
        }
        if (
          !isTeacher &&
          (nuts !== 0 || (input.achievements?.length ?? 0) > 0)
        ) {
          errors.push(
            `${name}: администратор создаёт учеников без начальных баллов и наград.`,
          );
          continue;
        }
        const login = normalizeName(name);
        const existing = await admin
          .from("students")
          .select("id")
          .eq("login_name", login)
          .maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) {
          errors.push(`${name}: уже есть в классе.`);
          continue;
        }
        const encrypted = await encryptPassword(password);
        const account = await admin.auth.admin.createUser({
          email: await emailFor(name),
          password,
          email_confirm: true,
        });
        if (account.error || !account.data.user) {
          errors.push(
            `${name}: ${account.error?.message ?? "не удалось создать аккаунт"}`,
          );
          continue;
        }
        const saved = await admin.rpc("staff_provision_student", {
          actor: user.id,
          encrypted_password: encrypted,
          student_id: account.data.user.id,
          student_name: name,
          student_login: login,
          initial_nuts: nuts,
          initial_achievements: input.achievements ?? [],
        });
        if (saved.error) {
          const cleanup = await admin.auth.admin.deleteUser(
            account.data.user.id,
          );
          if (cleanup.error)
            console.error(
              "Provision rollback failed for user",
              account.data.user.id,
            );
          errors.push(
            `${name}: ${saved.error.message || "не удалось сохранить ученика."}`,
          );
        } else created.push(name);
      }
      return reply({ created, errors });
    }

    if (body.action === "delete") {
      if (typeof body.id !== "string")
        return reply({ error: "Выберите ученика." }, 400);
      const removed = await admin.rpc("staff_delete_student", {
        actor: user.id,
        target_id: body.id,
      });
      if (removed.error) return reply({ error: removed.error.message }, 400);
      return reply({ ok: true });
    }
    if (body.action === "password") {
      if (!isTeacher)
        return reply({ error: "Пароли меняет только преподаватель." }, 403);
      if (typeof body.id !== "string")
        return reply({ error: "Не выбран ученик." }, 400);
      const student = await admin
        .from("students")
        .select("id")
        .eq("id", body.id)
        .maybeSingle();
      if (student.error) throw student.error;
      // Restricts admin operations to pupils; cannot delete/reset a teacher by ID.
      if (!student.data) return reply({ error: "Ученик не найден." }, 404);
      const alsoTeacher = await admin
        .from("teachers")
        .select("user_id")
        .eq("user_id", body.id)
        .maybeSingle();
      if (alsoTeacher.error) throw alsoTeacher.error;
      if (alsoTeacher.data)
        return reply({ error: "Нельзя изменить аккаунт учителя." }, 403);
      if (
        typeof body.password !== "string" ||
        body.password.length < 8 ||
        body.password.length > 128
      ) {
        return reply(
          { error: "Пароль должен содержать от 8 до 128 символов." },
          400,
        );
      }
      const encrypted = await encryptPassword(body.password);
      // Never display a stale password if a profile save fails after Auth succeeds.
      const invalidated = await admin
        .from("student_credentials")
        .upsert({
          student_id: body.id,
          ciphertext: null,
          updated_at: new Date().toISOString(),
        });
      if (invalidated.error) throw invalidated.error;
      const changed = await admin.auth.admin.updateUserById(body.id, {
        password: body.password,
      });
      if (changed.error) throw changed.error;
      const stored = await admin
        .from("student_credentials")
        .upsert({
          student_id: body.id,
          ciphertext: encrypted,
          updated_at: new Date().toISOString(),
        });
      if (stored.error)
        return reply(
          {
            error:
              "Пароль изменён, но не сохранён для просмотра. Задайте его повторно.",
          },
          500,
        );
      return reply({ ok: true });
    }
    return reply({ error: "Неизвестное действие." }, 400);
  } catch (error) {
    console.error(
      "manage-students failed",
      error instanceof Error ? error.message : "database error",
    );
    return reply(
      {
        error:
          "Операция не выполнена. Проверьте настройки базы и повторите попытку.",
      },
      500,
    );
  }
});
