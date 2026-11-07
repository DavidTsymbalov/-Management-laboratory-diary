import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function clientScenario({
  role = "student",
  contextError = null,
  requiresMfa = false,
  active = true,
  userError = null,
  session = true,
} = {}) {
  const calls = { hints: {}, signIns: [], signOuts: 0, invocations: [] };
  const user = { id: "account-id" };
  const db = {
    auth: {
      getSession: async () => ({
        data: {
          session: session ? { access_token: "verified-session-token" } : null,
        },
        error: null,
      }),
      getUser: async () => ({
        data: { user: userError ? null : user },
        error: userError,
      }),
      signInWithPassword: async (input) => {
        calls.signIns.push(input);
        return { error: null };
      },
      signOut: async () => {
        calls.signOuts++;
        return { error: null };
      },
    },
    rpc: async (name, args) => {
      if (name === "revoke_security_session") {
        calls.revoked = args.target_session;
        return { error: null };
      }
      if (name === "security_context")
        return {
          data: {
            id: user.id,
            name: "Имя пользователя",
            role,
            active,
            requires_mfa: requiresMfa,
            mfa_enrolled: requiresMfa,
            session_id: "real-session-id",
          },
          error: contextError,
        };
      if (name === "register_security_session") {
        calls.registrations = (calls.registrations ?? 0) + 1;
        return { error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    functions: {
      invoke: async (name, options) => {
        calls.invocations.push([name, structuredClone(options)]);
        return { data: { ok: true }, error: null };
      },
    },
  };
  const modules = {
    "@/lib/supabase": { getSupabase: () => db },
    "@/lib/student-identity": {
      studentEmail: async () => "student-identity",
      teacherEmail: async () => "teacher-identity",
      adminEmail: async () => "admin-identity",
      csaEmail: () => "csa-identity",
    },
    "@/lib/session": {
      setTeacherLoggedIn: (value) => {
        calls.hints.teacher = value;
      },
      setStudentSessionId: (value) => {
        calls.hints.student = value;
      },
    },
  };
  const context = { exports: {}, require: (name) => modules[name], Response };
  const source = ts.transpileModule(
    readFileSync(new URL("../src/lib/cloud-store.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(source, context);
  return { api: context.exports, calls };
}

test("promoted pupils keep student credentials and personal session while teacher identity stays separate", async () => {
  for (const role of ["student", "teacher", "admin", "csa"]) {
    const { api, calls } = clientScenario({ role });
    const account = await api.signInCloud("login", "test-password", role);
    assert.equal(account.role, role);
    assert.equal(account.name, "Имя пользователя");
    assert.equal(
      calls.signIns[0].email,
      `${role === "admin" ? "student" : role}-identity`,
    );
    assert.equal(calls.hints.teacher, role === "teacher");
    assert.equal(
      calls.hints.student,
      ["student", "admin"].includes(role) ? "account-id" : null,
    );
  }
});

test("a valid password does not bypass the selected role and rejected role signs out", async () => {
  const { api, calls } = clientScenario({ role: "student" });
  await assert.rejects(
    api.signInCloud("login", "test-password", "admin"),
    /права администратора/,
  );
  assert.equal(calls.signOuts, 1);
  assert.deepEqual(calls.hints, { teacher: false, student: null });
});

test("security checks fail closed on missing RPC, server failure, invalid user and revoked session", async () => {
  const failure = { code: "PGRST202", message: "missing security_context" };
  await assert.rejects(
    clientScenario({ contextError: failure }).api.getCloudRole(),
    (error) => error === failure,
  );
  const invalid = clientScenario({ userError: new Error("invalid jwt") });
  await assert.rejects(invalid.api.getCloudRole(), /invalid jwt/);
  assert.deepEqual(invalid.calls.hints, { teacher: false, student: null });
  await assert.rejects(
    clientScenario({ active: false }).api.getCloudRole(),
    /отозвана/,
  );
});
test("MFA pending role never grants local login hints or records a completed login", async () => {
  const { api, calls } = clientScenario({ role: "csa", requiresMfa: true });
  const account = await api.signInCloud("csa", "test-password", "csa");
  assert.equal(account.requiresMfa, true);
  assert.equal(calls.registrations ?? 0, 0);
  assert.deepEqual(calls.hints, { teacher: false, student: null });
});

test("staff management sends the current user token and cannot run without a session", async () => {
  const { api, calls } = clientScenario({ role: "teacher" });
  await api.manageCloudStudents({ action: "delete", id: "pupil-id" });
  assert.deepEqual(calls.invocations, [
    [
      "manage-students",
      {
        body: { action: "delete", id: "pupil-id" },
        headers: { Authorization: "Bearer verified-session-token" },
      },
    ],
  ]);
  const signedOut = clientScenario({ session: false });
  await assert.rejects(
    signedOut.api.manageCloudStudents({ action: "delete", id: "pupil-id" }),
    /Войдите/,
  );
  assert.equal(signedOut.calls.invocations.length, 0);
});

test("a promoted pupil can still sign in to their personal diary", async () => {
  const { api, calls } = clientScenario({ role: "admin" });
  const account = await api.signInCloud("login", "test-password", "student");
  assert.equal(account.role, "admin");
  assert.equal(calls.signIns[0].email, "student-identity");
  assert.equal(calls.signOuts, 0);
});

test("logout revokes only the verified current session before clearing provider credentials", async () => {
  const { api, calls } = clientScenario({ role: "teacher" });
  await api.signOutCloud();
  assert.equal(calls.revoked, "real-session-id");
  assert.equal(calls.signOuts, 1);
  const pending = clientScenario({ role: "csa", requiresMfa: true });
  await pending.api.signOutCloud();
  assert.equal(pending.calls.revoked, undefined);
  assert.equal(pending.calls.signOuts, 1);
});
