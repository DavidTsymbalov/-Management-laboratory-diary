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
