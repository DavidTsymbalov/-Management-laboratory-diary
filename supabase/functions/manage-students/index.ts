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
  Vary: "Origin",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function reply(
  data: unknown,
  status = 200,
  origin = "https://davidtsymbalov.github.io",
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Access-Control-Allow-Origin": origin,
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
  const origin =
    req.headers.get("Origin") ?? "https://davidtsymbalov.github.io";
  const allowed =
    origin === "https://davidtsymbalov.github.io" ||
    /^http:\/\/(localhost|127\.0\.0\.1):(3000|3001)$/.test(origin);
  const respond = (data: unknown, status = 200) =>
    reply(data, status, allowed ? origin : "https://davidtsymbalov.github.io");
  if (!allowed) return respond({ error: "Источник запроса не разрешён." }, 403);
  if (req.method === "OPTIONS")
    return new Response("ok", {
      headers: { ...cors, "Access-Control-Allow-Origin": origin },
    });
  if (req.method !== "POST")
    return respond({ error: "Метод не поддерживается." }, 405);
  let operation: string | null = null;
  let auditAdmin: ReturnType<typeof createClient<any>> | null = null;
  try {
    const token = req.headers
      .get("Authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return respond({ error: "Войдите в кабинет учителя." }, 401);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    auditAdmin = admin;
    // This check is mandatory even when the gateway's legacy verify_jwt is disabled.
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);
    if (authError || !user)
      return respond({ error: "Сессия истекла. Войдите снова." }, 401);
    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const checked = await caller.rpc("security_context");
    if (checked.error)
      return respond(
        { error: "Проверка безопасности недоступна. Повторите попытку." },
        503,
      );
    const context = checked.data;
    if (context?.id !== user.id || !context.active)
      return respond({ error: "Сессия отозвана. Войдите снова." }, 401);
    if (context.requires_mfa)
      return respond({ error: "Подтвердите вход кодом 2FA." }, 403);
    const isCSA = context.role === "csa";
    const isTeacher = context.role === "teacher" || isCSA;
    if (!isTeacher && context.role !== "admin")
      return respond(
        { error: "Действие доступно преподавателю или администратору." },
        403,
      );
    const begin = async (action: string, id: string) => {
      const result = await admin.rpc("security_begin_operation", {
        actor: user.id,
        sid: context.session_id,
        operation: action,
        target_user: id,
      });
      if (result.error || typeof result.data !== "string")
        throw new Error("Не удалось записать действие безопасности.");
      operation = result.data;
    };
    const finish = async (success: boolean) => {
      if (!operation) return;
      const result = await admin.rpc("security_finish_operation", {
        operation_id: operation,
        succeeded: success,
      });
      if (result.error)
        throw new Error("Не удалось завершить запись безопасности.");
      operation = null;
    };

    const raw = await req.text();
    if (raw.length > 200000)
      return respond({ error: "Слишком большой запрос." }, 413);
    const body = JSON.parse(raw);

    if (body.action === "view_password") {
      if (!isTeacher)
        return respond({ error: "Пароли доступны только преподавателю." }, 403);
      if (typeof body.id !== "string")
        return respond({ error: "Выберите ученика." }, 400);
      const saved = await admin
        .from("student_credentials")
        .select("ciphertext")
        .eq("student_id", body.id)
        .maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data?.ciphertext)
        return respond(
          {
            error:
              "Старый пароль не сохранён. Задайте новый — после этого его можно будет посмотреть.",
          },
          404,
        );
      await begin("password_read", body.id);
      try {
        const password = await decryptPassword(saved.data.ciphertext);
        await finish(true);
        return respond({ password });
      } catch {
        await finish(false);
        return respond(
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
        return respond(
          { error: "Добавляйте от 1 до 30 учеников за раз." },
          400,
        );
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
        const saved = await admin.rpc("secure_provision_student", {
          sid: context.session_id,
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
      return respond({ created, errors });
    }

    if (body.action === "delete") {
      if (typeof body.id !== "string")
        return respond({ error: "Выберите ученика." }, 400);
      const removed = await admin.rpc("secure_delete_student", {
        sid: context.session_id,
        actor: user.id,
        target_id: body.id,
      });
      if (removed.error) return respond({ error: removed.error.message }, 400);
      return respond({ ok: true });
    }
    if (body.action === "password") {
      if (!isTeacher)
        return respond({ error: "Пароли меняет только преподаватель." }, 403);
      if (typeof body.id !== "string")
        return respond({ error: "Не выбран ученик." }, 400);
      const student = await admin
        .from("students")
        .select("id")
        .eq("id", body.id)
        .maybeSingle();
      if (student.error) throw student.error;
      // Restricts admin operations to pupils; cannot delete/reset a teacher by ID.
      if (!student.data && !isCSA)
        return respond({ error: "Ученик не найден." }, 404);
      const alsoTeacher = await admin
        .from("teachers")
        .select("user_id")
        .eq("user_id", body.id)
        .maybeSingle();
      if (alsoTeacher.error) throw alsoTeacher.error;
      if (alsoTeacher.data && !isCSA)
        return respond({ error: "Нельзя изменить аккаунт учителя." }, 403);
      if (
        typeof body.password !== "string" ||
        body.password.length < (student.data ? 8 : 12) ||
        body.password.length > 128
      ) {
        return respond(
          { error: "Пароль должен содержать от 8 до 128 символов." },
          400,
        );
      }
      await begin("password_reset", body.id);
      const encrypted = student.data
        ? await encryptPassword(body.password)
        : null;
      // Never display a stale password if a profile save fails after Auth succeeds.
      if (student.data) {
        const invalidated = await admin.from("student_credentials").upsert({
          student_id: body.id,
          ciphertext: null,
          updated_at: new Date().toISOString(),
        });
        if (invalidated.error) throw invalidated.error;
      }
      const changed = await admin.auth.admin.updateUserById(body.id, {
        password: body.password,
      });
      if (changed.error) throw changed.error;
      await finish(true);
      if (student.data) {
        const stored = await admin.from("student_credentials").upsert({
          student_id: body.id,
          ciphertext: encrypted,
          updated_at: new Date().toISOString(),
        });
        if (stored.error)
          return respond(
            {
              error:
                "Пароль изменён, но не сохранён для просмотра. Задайте его повторно.",
            },
            500,
          );
      }
      return respond({ ok: true });
    }
    return respond({ error: "Неизвестное действие." }, 400);
  } catch {
    if (operation && auditAdmin)
      await Promise.resolve(
        auditAdmin.rpc("security_finish_operation", {
          operation_id: operation,
          succeeded: false,
        }),
      ).catch(() => null);
    console.error("manage-students operation failed");
    return respond(
      {
        error:
          "Операция не выполнена. Проверьте настройки базы и повторите попытку.",
      },
      500,
    );
  }
});
