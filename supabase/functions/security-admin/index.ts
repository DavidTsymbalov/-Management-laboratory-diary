import { createClient } from "npm:@supabase/supabase-js@2";
const site = "https://davidtsymbalov.github.io";
async function teacherEmail(login: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      login
        .normalize("NFKC")
        .trim()
        .replace(/\s+/gu, " ")
        .toLocaleLowerCase("ru-RU"),
    ),
  );
  return `t-${Array.from(new Uint8Array(digest), (v) =>
    v.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 48)}@teachers.management-laboratory.invalid`;
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? site;
  const allowed =
    origin === site ||
    /^http:\/\/(localhost|127\.0\.0\.1):(3000|3001)$/.test(origin);
  const headers = {
    "Access-Control-Allow-Origin": allowed ? origin : site,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (!allowed) return reply({ error: "Источник запроса не разрешён." }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST")
    return reply({ error: "Метод не поддерживается." }, 405);
  let operation: string | null = null;
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  try {
    const token = req.headers
      .get("Authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply({ error: "Войдите в CSA." }, 401);
    const verified = await service.auth.getUser(token);
    if (verified.error || !verified.data.user)
      return reply({ error: "Войдите снова." }, 401);
    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data: context, error } = await caller.rpc("security_context");
    if (error)
      return reply({ error: "Проверка безопасности недоступна." }, 503);
    if (!context?.active || context.id !== verified.data.user.id)
      return reply({ error: "Сессия отозвана." }, 401);
    if (context.role !== "csa" || context.requires_mfa)
      return reply({ error: "Требуется действующая сессия CSA." }, 403);
    const raw = await req.text();
    if (raw.length > 20000)
      return reply({ error: "Запрос слишком большой." }, 413);
    const body = JSON.parse(raw);
    const begin = async (action: string, target: string | null) => {
      const result = await service.rpc("security_begin_operation", {
        actor: context.id,
        sid: context.session_id,
        operation: action,
        target_user: target,
      });
      if (result.error || typeof result.data !== "string")
        throw new Error("audit");
      operation = result.data;
    };
    const finish = async (success: boolean) => {
      if (!operation) return;
      const result = await service.rpc("security_finish_operation", {
        operation_id: operation,
        succeeded: success,
      });
      if (result.error) throw new Error("audit");
      operation = null;
    };
    if (body.action === "staff_create") {
      const role = body.role,
        login =
          typeof body.login === "string"
            ? body.login.normalize("NFKC").trim().toLowerCase()
            : "",
        name = typeof body.name === "string" ? body.name.trim() : "";
      if (
        !["teacher", "csa"].includes(role) ||
        !login ||
        login.length > 64 ||
        !name ||
        name.length > 200 ||
        typeof body.password !== "string" ||
        body.password.length < 12 ||
        body.password.length > 128
      )
        return reply(
          { error: "Укажите роль, логин, имя и пароль от 12 до 128 символов." },
          400,
        );
      if (role === "csa" && !/^[a-z0-9_-]{3,32}$/.test(login))
        return reply(
          { error: "Логин CSA: 3–32 латинских буквы, цифры, _ или -." },
          400,
        );
      await begin("staff_create", null);
      const created = await service.auth.admin.createUser({
        email:
          role === "csa"
            ? `${login}@csa.management-laboratory.invalid`
            : await teacherEmail(login),
        password: body.password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        await finish(false);
        return reply(
          { error: "Не удалось создать аккаунт. Возможно, логин уже занят." },
          400,
        );
      }
      const saved = await service.rpc("csa_finalize_staff", {
        actor: context.id,
        sid: context.session_id,
        target_user: created.data.user.id,
        staff_role: role,
        display_name: name,
        staff_login: login,
      });
      if (saved.error) {
        await service.auth.admin.deleteUser(created.data.user.id);
        await finish(false);
        return reply(
          { error: "Аккаунт не создан. Проверьте настройки и повторите." },
          400,
        );
      }
      await finish(true);
      return reply({ ok: true });
    }
    if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id))
      return reply({ error: "Выберите аккаунт." }, 400);
    if (body.action === "mfa_reset") {
      await begin("mfa_reset", body.id);
      const factors = await service.auth.admin.mfa.listFactors({
        userId: body.id,
      });
      if (factors.error) throw factors.error;
      for (const factor of factors.data?.factors ?? []) {
        const removed = await service.auth.admin.mfa.deleteFactor({
          userId: body.id,
          id: factor.id,
        });
        if (removed.error) throw removed.error;
      }
      await finish(true);
      return reply({ ok: true });
    }
    if (body.action === "account_delete") {
      const result = await service.rpc("csa_delete_account", {
        actor: context.id,
        sid: context.session_id,
        target_user: body.id,
      });
      if (result.error) return reply({ error: result.error.message }, 400);
      return reply({ ok: true });
    }
    return reply({ error: "Неизвестное действие." }, 400);
  } catch {
    if (operation)
      await Promise.resolve(
        service.rpc("security_finish_operation", {
          operation_id: operation,
          succeeded: false,
        }),
      ).catch(() => null);
    return reply(
      { error: "Операция не выполнена. Проверьте настройки и повторите." },
      500,
    );
  }
});
