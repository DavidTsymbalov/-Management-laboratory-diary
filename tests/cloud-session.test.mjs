import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function clientScenario({ role = "student", missingAdmins = false, adminError = null, userError = null, session = true } = {}) {
  const calls = { hints: {}, signIns: [], signOuts: 0, invocations: [] };
  const user = { id: "account-id" };
  const db = {
    auth: {
      getSession: async () => ({ data: { session: session ? { access_token: "verified-session-token" } : null }, error: null }),
      getUser: async () => ({ data: { user: userError ? null : user }, error: userError }),
      signInWithPassword: async (input) => { calls.signIns.push(input); return { error: null }; },
      signOut: async () => { calls.signOuts++; return { error: null }; },
    },
    from: (table) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
      if (table === "admins" && (missingAdmins || adminError)) return { data: null, error: adminError || { code: "PGRST205" } };
      const selected = { teacher: "teachers", admin: "admins", student: "students" }[role];
      return { data: table === selected ? { id: user.id, user_id: user.id, name: "Имя пользователя" } : null, error: null };
    } }) }) }),
    functions: { invoke: async (name, options) => { calls.invocations.push([name, structuredClone(options)]); return { data: { ok: true }, error: null }; } },
  };
  const modules = {
    "@/lib/supabase": { getSupabase: () => db },
    "@/lib/student-identity": {
      studentEmail: async () => "student-identity", teacherEmail: async () => "teacher-identity", adminEmail: async () => "admin-identity",
    },
    "@/lib/session": {
      setTeacherLoggedIn: (value) => { calls.hints.teacher = value; },
      setAdminLoggedIn: (value) => { calls.hints.admin = value; },
      setStudentSessionId: (value) => { calls.hints.student = value; },
    },
  };
  const context = { exports: {}, require: (name) => modules[name], Response };
  const source = ts.transpileModule(readFileSync(new URL("../src/lib/cloud-store.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, context);
  return { api: context.exports, calls };
}

test("each verified role signs in with its own identity and receives its server name", async () => {
  for (const role of ["student", "teacher", "admin"]) {
    const { api, calls } = clientScenario({ role });
    const account = await api.signInCloud("login", "test-password", role);
    assert.equal(account.role, role);
    assert.equal(account.name, "Имя пользователя");
    assert.equal(calls.signIns[0].email, `${role}-identity`);
    assert.equal(calls.hints.teacher, role === "teacher");
    assert.equal(calls.hints.admin, role === "admin");
    assert.equal(calls.hints.student, role === "student" ? "account-id" : null);
  }
});

test("a valid password does not bypass the selected role and rejected role signs out", async () => {
  const { api, calls } = clientScenario({ role: "student" });
  await assert.rejects(api.signInCloud("login", "test-password", "admin"), /права администратора/);
  assert.equal(calls.signOuts, 1);
  assert.deepEqual(calls.hints, { teacher: false, admin: false, student: null });
});

test("rolling deployment tolerates only the missing admins table, not a server authorization failure", async () => {
  const existing = clientScenario({ role: "student", missingAdmins: true });
  assert.equal((await existing.api.getCloudRole()).role, "student");
  const failure = { code: "42501", message: "permission denied" };
  await assert.rejects(clientScenario({ adminError: failure }).api.getCloudRole(), (error) => error === failure);
  const invalid = clientScenario({ userError: new Error("invalid jwt") });
  await assert.rejects(invalid.api.getCloudRole(), /invalid jwt/);
  assert.deepEqual(invalid.calls.hints, { teacher: false, admin: false, student: null });
});

test("staff management sends the current user token and cannot run without a session", async () => {
  const { api, calls } = clientScenario({ role: "teacher" });
  await api.manageCloudAdministrators({ action: "delete", id: "admin-id" });
  assert.deepEqual(calls.invocations, [["manage-students", {
    body: { action: "delete-admin", id: "admin-id" }, headers: { Authorization: "Bearer verified-session-token" },
  }]]);
  const signedOut = clientScenario({ session: false });
  await assert.rejects(signedOut.api.manageCloudAdministrators({ action: "delete", id: "admin-id" }), /Войдите снова/);
  assert.equal(signedOut.calls.invocations.length, 0);
});
