import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function functionHandler(admin) {
  let handler;
  const context = {
    exports: {}, require: () => ({ createClient: () => admin }), crypto: webcrypto,
    TextEncoder, Request, Response, console: { error() {} },
    Deno: { env: { get: () => "test-only" }, serve: (fn) => { handler = fn; } },
  };
  vm.runInNewContext(compile("../supabase/functions/manage-students/index.ts"), context);
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
  assert.ok(readFileSync(new URL("../supabase/setup-teacher.sql", import.meta.url), "utf8").includes(teacher));
  const administrator = await browser.exports.adminEmail("ＭＡＲＩＡ");
  assert.equal(administrator, await context.emailFor(" maria ", "admin"));
  assert.equal(administrator, await browser.exports.adminEmail("Maria"));
  assert.notEqual(administrator, await browser.exports.studentEmail("maria"));
  assert.notEqual(administrator, await browser.exports.teacherEmail("maria"));
});

function staffService(caller = "admin", options = {}) {
  const calls = { create: [], update: [], delete: [], provision: [] };
  const profiles = {
    teachers: [{ user_id: "teacher" }, { user_id: "teacher-with-student-profile" }],
    admins: [
      { user_id: "admin", login_name: "maria" }, { user_id: "other-admin", login_name: "oleg" },
      { user_id: "admin-with-student-profile", login_name: "duplicate" },
      { user_id: "teacher-with-student-profile", login_name: "trusted-mistake" },
    ],
    students: [{ id: "student" }, { id: "teacher-with-student-profile" }, { id: "admin-with-student-profile" }],
  };
  const service = {
    auth: {
      getUser: async () => ({ data: { user: { id: caller } }, error: null }),
      admin: {
        createUser: async (input) => { calls.create.push(input); return { data: { user: { id: "new-account" } }, error: null }; },
        updateUserById: async (...args) => { calls.update.push(structuredClone(args)); return { error: null }; },
        deleteUser: async (id) => { calls.delete.push(id); return { error: null }; },
      },
    },
    from: (table) => ({ select: () => ({ eq: (column, value) => ({ maybeSingle: async () => ({
      data: profiles[table]?.find((row) => row[column] === value) ?? null,
      error: options.unavailableAdmins && table === "admins" ? { code: "PGRST205" } : null,
    }) }) }) }),
    rpc: async (name, args) => {
      calls.provision.push([name, args]);
      const profile = name === "provision_administrator" ? {
        user_id: args.administrator_id, name: args.administrator_name,
        login_name: args.administrator_login, created_at: "2026-11-05T00:00:00Z",
      } : null;
      return { error: options.provisionFails ? { message: "failed" } : null,
        data: options.arrayResponse && profile ? [profile] : profile };
    },
  };
  const { handler } = functionHandler(service);
  const request = (body) => handler(new Request("https://example.test", {
    method: "POST", headers: { Authorization: "Bearer valid" }, body: JSON.stringify(body),
  }));
  return { calls, request };
}

test("administrator can manage students but cannot manage staff or escalate role", async () => {
  const { calls, request } = staffService();
  const created = await request({ action: "create", students: [{ name: "Новый Ученик", password: "strong-password" }] });
  assert.equal(created.status, 200);
  assert.deepEqual((await created.json()).created, ["Новый Ученик"]);
  assert.equal((await request({ action: "password", id: "student", password: "new-password" })).status, 200);
  assert.equal((await request({ action: "delete", id: "student" })).status, 200);
  for (const action of ["create-admin", "password-admin", "delete-admin"]) {
    assert.equal((await request({ action, id: "other-admin", name: "Fake", login: "fake", password: "strong-password", role: "teacher" })).status, 403);
  }
  for (const id of ["teacher", "admin", "other-admin", "teacher-with-student-profile", "admin-with-student-profile"]) {
    for (const action of ["password", "delete"]) {
      const response = await request({ action, id, password: "strong-password" });
      assert.ok([403, 404].includes(response.status));
    }
  }
  assert.equal(calls.create.length, 1);
  assert.deepEqual(calls.update, [["student", { password: "new-password" }]]);
  assert.deepEqual(calls.delete, ["student"]);
  assert.deepEqual(calls.provision.map(([name]) => name), ["provision_student"]);
});

test("only teacher creates, resets and deletes administrators, with separate login and display name", async () => {
  const { calls, request } = staffService("teacher");
  const response = await request({ action: "create-admin", name: "Мария Иванова", login: "  MARIA.NEW  ", password: "strong-password" });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).administrator, {
    id: "new-account", name: "Мария Иванова", login: "maria.new", createdAt: "2026-11-05T00:00:00Z",
  });
  assert.ok(calls.create[0].email.endsWith("@admins.management-laboratory.invalid"));
  assert.equal(calls.provision[0][1].teacher_id, "teacher");
  assert.equal((await request({ action: "password-admin", id: "other-admin", password: "new-password" })).status, 200);
  assert.equal((await request({ action: "delete-admin", id: "other-admin" })).status, 200);
  assert.equal((await request({ action: "create-admin", name: "Duplicate", login: "MARIA", password: "strong-password" })).status, 409);
  assert.equal((await request({ action: "create-admin", name: "Bad", login: "has spaces", password: "strong-password" })).status, 400);
  assert.equal((await request({ action: "create-admin", name: "Bad", login: "valid", password: "short" })).status, 400);
  for (const action of ["password-admin", "delete-admin"]) {
    for (const id of ["student", "teacher", "teacher-with-student-profile"]) {
      assert.ok([403, 404].includes((await request({ action, id, password: "strong-password" })).status));
    }
  }
  assert.equal(calls.create.length, 1);
  assert.deepEqual(calls.update, [["other-admin", { password: "new-password" }]]);
  assert.deepEqual(calls.delete, ["other-admin"]);
});

test("failed administrator provisioning removes the new auth account and missing migration is actionable", async () => {
  const failed = staffService("teacher", { provisionFails: true });
  const input = { action: "create-admin", name: "Новый", login: "new.admin", password: "strong-password" };
  assert.equal((await failed.request(input)).status, 500);
  assert.deepEqual(failed.calls.delete, ["new-account"]);
  const missing = staffService("teacher", { unavailableAdmins: true });
  assert.equal((await missing.request(input)).status, 503);
  assert.equal(missing.calls.create.length, 0);
});

test("administrator provisioning accepts PostgREST's composite array response", async () => {
  const { request } = staffService("teacher", { arrayResponse: true });
  const response = await request({ action: "create-admin", name: "Новый", login: "new.admin", password: "strong-password" });
  assert.equal(response.status, 200);
  const { administrator } = await response.json();
  assert.equal(administrator.id, "new-account");
  assert.equal(administrator.login, "new.admin");
});

test("admin function rejects absent/forged tokens and authenticated non-teachers", async () => {
  let adminCalls = 0;
  const admin = {
    auth: { getUser: async (token) => token === "valid" ? { data: { user: { id: "student" } }, error: null } :
      { data: { user: null }, error: new Error("bad jwt") },
      admin: { deleteUser: () => { adminCalls++; } } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  };
  const { handler } = functionHandler(admin);
  for (const [token, status] of [[null, 401], ["forged", 401], ["valid", 403]]) {
    const response = await handler(new Request("https://example.test", {
      method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ action: "delete", id: "teacher" }),
    }));
    assert.equal(response.status, status);
  }
  assert.equal(adminCalls, 0);
  assert.equal((await handler(new Request("https://example.test", { method: "OPTIONS" }))).status, 200);
});

test("admin function rolls back a new auth account when saving its profile fails", async () => {
  const deleted = [];
  let creates = 0;
  const admin = {
    auth: {
      getUser: async () => ({ data: { user: { id: "teacher" } }, error: null }),
      admin: {
        createUser: async () => { creates++; return { data: { user: { id: "new-student" } }, error: null }; },
        deleteUser: async (id) => { deleted.push(id); return { error: null }; },
      },
    },
    from: (table) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "teachers" ? { user_id: "teacher" } : null, error: null }) }) }) }),
    rpc: async () => ({ error: { message: "invalid imported achievement" } }),
  };
  const { handler } = functionHandler(admin);
  const response = await handler(new Request("https://example.test", {
    method: "POST", headers: { Authorization: "Bearer valid" },
    body: JSON.stringify({ action: "create", students: [
      { name: "Иванов Иван", password: "strong-password" },
      { name: "Петров Пётр", password: "1111" },
    ] }),
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.created.length, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(creates, 1);
  assert.deepEqual(deleted, ["new-student"]);
});
