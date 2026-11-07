import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
const account = "40000000-0000-4000-8000-000000000001";
function setup({
  role = "csa",
  requiresMfa = false,
  active = true,
  profileError = false,
  failAuth = false,
} = {}) {
  let handler;
  const calls = [];
  const service = {
    auth: {
      getUser: async (token) => ({
        data: { user: token === "valid" ? { id: account } : null },
        error: token === "valid" ? null : { message: "forged" },
      }),
      admin: {
        createUser: async (input) => {
          calls.push(["create", input]);
          return { data: { user: { id: "new-account" } }, error: null };
        },
        deleteUser: async (id) => {
          calls.push(["delete", id]);
          return { error: null };
        },
        mfa: {
          listFactors: async () => ({
            data: { factors: [{ id: "factor" }] },
            error: failAuth ? { message: "failed" } : null,
          }),
          deleteFactor: async (input) => {
            calls.push(["removeFactor", input]);
            return { error: null };
          },
        },
      },
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === "security_begin_operation")
        return { data: "operation", error: null };
      if (name === "csa_finalize_staff" && profileError)
        return { error: { message: "profile save failed" } };
      return { data: null, error: null };
    },
  };
  const caller = {
    rpc: async () => ({
      data: {
        id: account,
        session_id: "verified-session",
        role,
        requires_mfa: requiresMfa,
        active,
      },
      error: null,
    }),
  };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL(
          "../supabase/functions/security-admin/index.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports: {},
      crypto: webcrypto,
      TextEncoder,
      Response,
      Request,
      Deno: { env: { get: () => "test-only" }, serve: (fn) => (handler = fn) },
      require: () => ({
        createClient: (_url, _key, options) =>
          options?.global ? caller : service,
      }),
    },
  );
  const request = (
    body,
    token = "valid",
    origin = "https://davidtsymbalov.github.io",
  ) =>
    handler(
      new Request("https://example.test", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Origin: origin },
        body: JSON.stringify(body),
      }),
    );
  return { request, calls };
}
test("CSA Edge rejects every other role, pending MFA, disabled session, forged token and foreign origin before mutations", async () => {
  for (const options of [
    { role: "teacher" },
    { role: "admin" },
    { role: "student" },
    { requiresMfa: true },
    { active: false },
  ]) {
    const { request, calls } = setup(options);
    const response = await request({ action: "account_delete", id: account });
    assert.ok([401, 403].includes(response.status));
    assert.equal(calls.length, 0);
  }
  const forged = setup();
  assert.equal((await forged.request({}, "forged")).status, 401);
  assert.equal(
    (await forged.request({}, "valid", "https://attacker.example")).status,
    403,
  );
  assert.equal(forged.calls.length, 0);
});
test("staff creation validates strong password, derives role-specific identity and rolls back orphaned Auth account", async () => {
  const invalid = setup();
  assert.equal(
    (
      await invalid.request({
        action: "staff_create",
        role: "csa",
        login: "csa",
        name: "CSA",
        password: "short",
      })
    ).status,
    400,
  );
  assert.equal(invalid.calls.length, 0);
  for (const profileError of [false, true]) {
    const { request, calls } = setup({ profileError });
    const response = await request({
      action: "staff_create",
      role: "csa",
      login: "CSA2",
      name: "Разработчик",
      password: "not-real-password-123",
    });
    assert.equal(response.status, profileError ? 400 : 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(
      calls.find((item) => item[0] === "create")[1].email,
      "csa2@csa.management-laboratory.invalid",
    );
    assert.equal(
      calls.find((item) => item[0] === "csa_finalize_staff")[1].actor,
      account,
    );
    assert.equal(
      calls.some((item) => item[0] === "delete"),
      profileError,
    );
    assert.equal(
      calls.find((item) => item[0] === "security_finish_operation")[1]
        .succeeded,
      !profileError,
    );
  }
});
test("MFA reset is audited with outcome even when Auth fails and actor always comes from verified session", async () => {
  for (const failAuth of [false, true]) {
    const { request, calls } = setup({ failAuth });
    const response = await request({
      action: "mfa_reset",
      id: account,
      actor: "forged-actor",
    });
    assert.equal(response.status, failAuth ? 500 : 200);
    assert.equal(
      calls.find((item) => item[0] === "security_begin_operation")[1].actor,
      account,
    );
    assert.equal(
      calls.find((item) => item[0] === "security_finish_operation")[1]
        .succeeded,
      !failAuth,
    );
  }
});
