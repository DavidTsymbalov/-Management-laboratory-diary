import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

function compile(path) {
  return ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
}

function functionHandler(admin, options = {}) {
  const originalRpc = admin.rpc?.bind(admin);
  const service = {
    ...admin,
    rpc: async (name, args) => {
      if (name === "security_begin_operation")
        return { data: "11111111-1111-4111-8111-111111111111", error: null };
      if (name === "security_finish_operation") return { error: null };
      return originalRpc?.(name, args) ?? { error: null };
    },
  };
  let handler;
  const context = {
    exports: {},
    require: () => ({
      createClient: (_url, _key, config) =>
        config?.global
          ? {
              rpc: async () => {
                if (options.securityError)
                  return { error: { message: "security unavailable" } };
                const verified = await admin.auth.getUser("valid");
                const id = verified.data.user?.id;
                return {
                  data: {
                    id,
                    session_id: "real-session",
                    active: options.active ?? true,
                    requires_mfa: options.requiresMfa ?? false,
                    role:
                      options.role ??
                      (id === "teacher"
                        ? "teacher"
                        : id === "student-admin"
                          ? "admin"
                          : "student"),
                  },
                  error: null,
                };
              },
            }
          : service,
    }),
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Request,
    Response,
    console: { error() {} },
    Deno: {
      env: { get: () => "test-only" },
      serve: (fn) => {
        handler = fn;
      },
    },
  };
  vm.runInNewContext(
    compile("../supabase/functions/manage-students/index.ts"),
    context,
  );
  return { handler, context };
}

test("student names normalize consistently in browser and server logins", async () => {
  const browser = { exports: {}, crypto: webcrypto, TextEncoder };
  vm.runInNewContext(compile("../src/lib/student-identity.ts"), browser);
  const { context } = functionHandler({});
  const variants = ["Иванов Иван", "  ИВАНОВ   Иван ", "Иванов\tИван"];
  const expected = await browser.exports.studentEmail(variants[0]);
  for (const name of variants) {
    assert.equal(await browser.exports.studentEmail(name), expected);
    assert.equal(await context.emailFor(name), expected);
  }
  assert.notEqual(await browser.exports.studentEmail("Петров Иван"), expected);
  const teacher = await browser.exports.teacherEmail("teacher");
  assert.equal(await browser.exports.teacherEmail("  TEACHER  "), teacher);
  assert.notEqual(await browser.exports.studentEmail("teacher"), teacher);
  assert.ok(teacher.split("@")[0].length <= 64);
  assert.ok(
    readFileSync(
      new URL("../supabase/setup-teacher.sql", import.meta.url),
      "utf8",
    ).includes(teacher),
  );
});

test("admin function rejects absent/forged tokens and authenticated non-teachers", async () => {
  let adminCalls = 0;
  const admin = {
    auth: {
      getUser: async (token) =>
        token === "valid"
          ? { data: { user: { id: "student" } }, error: null }
          : { data: { user: null }, error: new Error("bad jwt") },
      admin: {
        deleteUser: () => {
          adminCalls++;
        },
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  };
  const { handler } = functionHandler(admin);
  for (const [token, status] of [
    [null, 401],
    ["forged", 401],
    ["valid", 403],
  ]) {
    const response = await handler(
      new Request("https://example.test", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: JSON.stringify({ action: "delete", id: "teacher" }),
      }),
    );
    assert.equal(response.status, status);
  }
  assert.equal(adminCalls, 0);
  assert.equal(
    (await handler(new Request("https://example.test", { method: "OPTIONS" })))
      .status,
    200,
  );
});

test("admin function rolls back a new auth account when saving its profile fails", async () => {
  const deleted = [];
  let creates = 0;
  const admin = {
    auth: {
      getUser: async () => ({ data: { user: { id: "teacher" } }, error: null }),
      admin: {
        createUser: async () => {
          creates++;
          return { data: { user: { id: "new-student" } }, error: null };
        },
        deleteUser: async (id) => {
          deleted.push(id);
          return { error: null };
        },
      },
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "teachers" ? { user_id: "teacher" } : null,
            error: null,
          }),
        }),
      }),
    }),
    rpc: async () => ({ error: { message: "invalid imported achievement" } }),
  };
  const { handler } = functionHandler(admin);
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: "Bearer valid" },
      body: JSON.stringify({
        action: "create",
        students: [
          { name: "Иванов Иван", password: "strong-password" },
          { name: "Петров Пётр", password: "1111" },
        ],
      }),
    }),
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.created.length, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(creates, 1);
  assert.deepEqual(deleted, ["new-student"]);
});

test("credential envelopes decrypt only on server, are randomized, and reject tampering", async () => {
  const { context } = functionHandler({});
  const password = "not-a-real-password-123";
  const encrypted = await context.encryptPassword(password);
  const second = await context.encryptPassword(password);
  assert.notEqual(encrypted, second);
  assert.ok(!encrypted.includes(password));
  assert.equal(await context.decryptPassword(encrypted), password);
  const tampered =
    encrypted.slice(0, -2) + (encrypted.endsWith("00") ? "01" : "00");
  await assert.rejects(context.decryptPassword(tampered));
});

test("administrator cannot view or reset passwords and member operations delegate quota enforcement to the database", async () => {
  const calls = [];
  const admin = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "student-admin" } },
        error: null,
      }),
      admin: {
        updateUserById: async () => {
          throw new Error("must not run");
        },
      },
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "student_administrators"
                ? { student_id: "student-admin" }
                : null,
            error: null,
          }),
        }),
      }),
    }),
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { error: { message: "Превышен дневной лимит." } };
    },
  };
  const { handler } = functionHandler(admin);
  for (const action of ["view_password", "password"]) {
    const response = await handler(
      new Request("https://example.test", {
        method: "POST",
        headers: { Authorization: "Bearer valid" },
        body: JSON.stringify({ action, id: "pupil", password: "not-real-123" }),
      }),
    );
    assert.equal(response.status, 403);
  }
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: "Bearer valid" },
      body: JSON.stringify({ action: "delete", id: "pupil", actor: "teacher" }),
    }),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Превышен/);
  assert.equal(calls[0].name, "secure_delete_student");
  assert.equal(calls[0].args.actor, "student-admin");
});

test("only verified teacher can request a saved password and response is never cacheable", async () => {
  const seed = functionHandler({});
  const encrypted = await seed.context.encryptPassword(
    "not-a-real-password-123",
  );
  const admin = {
    auth: {
      getUser: async () => ({ data: { user: { id: "teacher" } }, error: null }),
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "teachers"
                ? { user_id: "teacher" }
                : table === "student_credentials"
                  ? { ciphertext: encrypted }
                  : null,
            error: null,
          }),
        }),
      }),
    }),
  };
  const { handler } = functionHandler(admin);
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: "Bearer valid" },
      body: JSON.stringify({ action: "view_password", id: "pupil" }),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).password, "not-a-real-password-123");
});

test("Edge authorizes using verified context, rejects pending MFA, revoked sessions and disallowed origins", async () => {
  const admin = {
    auth: {
      getUser: async () => ({ data: { user: { id: "teacher" } }, error: null }),
    },
  };
  for (const [config, status] of [
    [{ requiresMfa: true }, 403],
    [{ active: false }, 401],
    [{ securityError: true }, 503],
  ]) {
    const { handler } = functionHandler(admin, config);
    const response = await handler(
      new Request("https://example.test", {
        method: "POST",
        headers: { Authorization: "Bearer valid" },
        body: JSON.stringify({ action: "delete", id: "pupil" }),
      }),
    );
    assert.equal(response.status, status);
  }
  const response = await functionHandler(admin).handler(
    new Request("https://example.test", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        Authorization: "Bearer valid",
      },
      body: "{}",
    }),
  );
  assert.equal(response.status, 403);
  assert.notEqual(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://attacker.example",
  );
});
