import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  securitySetup,
  teacher,
  alice,
  bob,
  outsider,
  csa,
} from "./helpers/security-db.mjs";
const caps = { capacity: 26, deleted: 5, points: 100, awards: 10 };
test("verified sessions and MFA gate all roles, spoofed metadata cannot create CSA, revoked JWTs lose table and RPC access", async () => {
  const { db, as, sessions } = await securitySetup();
  try {
    assert.equal((await as(csa, "select is_csa() ok"))[0].ok, true);
    assert.equal(
      (await as(csa, "select is_csa() ok", [], { aal: "aal1" }))[0].ok,
      false,
    );
    await assert.rejects(
      as(csa, "select award_nuts($1,5)", [[bob]], { aal: "aal1" }),
      /менять баллы/,
    );
    for (const id of [alice, bob, outsider]) {
      assert.equal((await as(id, "select is_csa() ok"))[0].ok, false);
      await assert.rejects(
        as(id, "insert into csa_accounts values($1,'CSA')", [id]),
        /permission denied/i,
      );
      await assert.rejects(
        as(id, "select * from list_security_events()"),
        /Журнал безопасности/,
      );
    }
    await as(teacher, "select configure_student_administrator($1,$2)", [
      alice,
      caps,
    ]);
    await as(alice, "select award_nuts($1,5)", [[bob]]);
    const event = (
      await as(
        teacher,
        "select * from list_security_events(null,$1,null,'points')",
        [alice],
      )
    )[0];
    assert.equal(event.target_id, bob);
    assert.equal(event.details.before, 0);
    assert.equal(event.details.after, 5);
    assert.equal(event.session_id, sessions.get(alice));
    await as(csa, "select revoke_security_session($1)", [sessions.get(alice)]);
    assert.equal((await as(alice, "select is_staff() ok"))[0].ok, false);
    assert.equal((await as(alice, "select * from students")).length, 0);
    await assert.rejects(
      as(alice, "select award_nuts($1,5)", [[bob]]),
      /менять баллы/,
    );
    await assert.rejects(
      as(alice, "select send_student_message($1,'x',$2)", [bob, randomUUID()]),
      /Сессия отозвана/,
    );
    await assert.rejects(
      as(alice, "select create_attendance_lessons(array['2026-11-12'::date])"),
      /доступен преподавателю/,
    );
    await assert.rejects(
      as(null, "select security_context()", [], { role: "anon" }),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});
test("audit is append-only, real logins deduplicate, teachers cannot grant themselves CSA and CSA cannot read private chats", async () => {
  const { db, as, sessions } = await securitySetup();
  try {
    await as(teacher, "select register_security_session()");
    await as(teacher, "select register_security_session()");
    assert.equal(
      (
        await as(
          teacher,
          "select * from list_security_events(null,null,null,'auth_login')",
        )
      ).length,
      1,
    );
    for (const id of [teacher, csa]) {
      await assert.rejects(
        as(id, "delete from security_events"),
        /permission denied/i,
      );
      await assert.rejects(
        as(id, "update security_events set actor_name='Подмена'"),
        /permission denied/i,
      );
      await assert.rejects(
        as(
          id,
          "insert into security_events(actor_name,actor_role,action) values('x','csa','points')",
        ),
        /permission denied/i,
      );
    }
    await assert.rejects(
      as(teacher, "select csa_account_enabled($1,false)", [bob]),
      /Только CSA/,
    );
    await assert.rejects(
      as(teacher, "select security_service_actor($1,$2)", [
        teacher,
        sessions.get(teacher),
      ]),
      /permission denied/i,
    );
    await as(alice, "select send_student_message($1,'Секрет',$2)", [
      bob,
      randomUUID(),
    ]);
    assert.equal(
      (await as(csa, "select * from student_emoji_messages")).length,
      0,
    );
    await assert.rejects(
      as(csa, "select student_emoji_thread($1)", [alice]),
      /только ученикам/,
    );
    await as(csa, "select configure_student_administrator($1,$2)", [
      alice,
      caps,
    ]);
    await as(csa, "select award_nuts($1,500)", [[alice, bob]]);
    assert.equal(
      (await db.query("select nuts from students where id=$1", [bob])).rows[0]
        .nuts,
      500,
    );
    await assert.rejects(
      as(alice, "select * from list_security_events()"),
      /Журнал безопасности/,
    );
  } finally {
    await db.close();
  }
});
test("enrolled teacher needs AAL2, account disabling blocks sessions, sensitive operations are audited and invalidation survives Auth failure", async () => {
  const { db, as, sessions } = await securitySetup();
  try {
    await db.query(
      "insert into auth.mfa_factors(user_id,status,factor_type) values($1,'verified','totp')",
      [teacher],
    );
    assert.equal(
      (await as(teacher, "select security_context() as ctx"))[0].ctx
        .requires_mfa,
      true,
    );
    await assert.rejects(
      as(teacher, "select register_security_session()"),
      /Подтвердите/,
    );
    assert.equal(
      (await as(teacher, "select is_teacher() ok", [], { aal: "aal2" }))[0].ok,
      true,
    );
    await as(csa, "select csa_account_enabled($1,false)", [bob]);
    assert.equal(
      (await as(bob, "select security_context() ctx"))[0].ctx.active,
      false,
    );
    await as(csa, "select csa_account_enabled($1,true)", [bob]);
    assert.equal(
      (await as(bob, "select security_context() ctx"))[0].ctx.active,
      false,
      "unblocking does not revive old sessions",
    );
    await assert.rejects(
      as(csa, "select csa_account_enabled($1,false)", [csa]),
      /другой аккаунт/,
    );
    const operation = (
      await as(
        null,
        "select security_begin_operation($1,$2,'password_reset',$3) op",
        [csa, sessions.get(csa), teacher],
        { role: "service_role" },
      )
    )[0].op;
    await as(null, "select security_finish_operation($1,false)", [operation], {
      role: "service_role",
    });
    assert.equal(
      (
        await as(teacher, "select security_context() ctx", [], { aal: "aal2" })
      )[0].ctx.active,
      false,
    );
    const logs = await as(
      csa,
      "select * from list_security_events(null,null,$1,'password_reset')",
      [teacher],
    );
    assert.deepEqual(
      logs.map((item) => item.details.outcome),
      ["failure", "pending"],
    );
    assert.equal(JSON.stringify(logs).includes("test-password"), false);
  } finally {
    await db.close();
  }
});

test("provider changes remain visible without storing secrets and MFA removal never downgrades the required protection", async () => {
  const { db, as } = await securitySetup();
  try {
    const factor = (
      await db.query(
        "insert into auth.mfa_factors(user_id,status,factor_type) values($1,'unverified','totp') returning id",
        [teacher],
      )
    ).rows[0].id;
    assert.equal((await as(teacher, "select is_teacher() ok"))[0].ok, true);
    await db.query(
      "update auth.mfa_factors set status='verified' where id=$1",
      [factor],
    );
    assert.equal(
      (await as(teacher, "select security_context() ctx"))[0].ctx.requires_mfa,
      true,
    );
    await db.query("delete from auth.mfa_factors where id=$1", [factor]);
    assert.equal(
      (await as(teacher, "select security_context() ctx"))[0].ctx.active,
      false,
    );
    const newSid = randomUUID();
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      newSid,
      teacher,
    ]);
    assert.equal(
      (
        await as(teacher, "select security_context() ctx", [], { sid: newSid })
      )[0].ctx.requires_mfa,
      true,
      "fresh AAL1 login must enroll/verify again",
    );
    await db.query(
      "update auth.users set encrypted_password='SECRET_HASH_NEVER_LOG' where id=$1",
      [bob],
    );
    assert.equal(
      (await as(bob, "select security_context() ctx"))[0].ctx.active,
      false,
    );
    const events = await as(csa, "select * from list_security_events()");
    for (const action of [
      "mfa_enabled",
      "mfa_factor_removed",
      "auth_password_changed",
    ])
      assert.ok(events.some((event) => event.action === action));
    assert.ok(!JSON.stringify(events).includes("SECRET_HASH_NEVER_LOG"));
  } finally {
    await db.close();
  }
});
test("CSA manages staff and reactions through guarded endpoints, attendance logs exact target and status, deletes retain history", async () => {
  const { db, as, sessions } = await securitySetup();
  try {
    const newStaff = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'staff@teachers.management-laboratory.invalid')",
      [newStaff],
    );
    const finalize =
      "select csa_finalize_staff($1,$2,$3,'teacher','Второй преподаватель','second')";
    await assert.rejects(
      as(null, finalize, [teacher, sessions.get(teacher), newStaff], {
        role: "service_role",
      }),
      /Только CSA/,
    );
    await as(null, finalize, [csa, sessions.get(csa), newStaff], {
      role: "service_role",
    });
    assert.equal(
      (await as(csa, "select security_accounts() accounts"))[0].accounts.find(
        (item) => item.id === newStaff,
      ).login,
      "second",
    );
    const items = (await as(csa, "select * from chat_reaction_display")).map(
      (item) => ({ ...item, glyph: item.key === "💩" ? "🐸" : item.glyph }),
    );
    await assert.rejects(
      as(teacher, "select csa_reaction_display($1)", [items]),
      /Только CSA/,
    );
    await assert.rejects(
      as(csa, "select csa_reaction_display($1)", [[items[0]]]),
      /восемь/,
    );
    await as(csa, "select csa_reaction_display($1)", [items]);
    assert.equal(
      (
        await as(
          alice,
          "select glyph from chat_reaction_display where key='💩'",
        )
      )[0].glyph,
      "🐸",
    );
    const lesson = (
      await as(
        teacher,
        "select * from create_attendance_lessons(array['2026-11-12'::date])",
      )
    )[0];
    await as(teacher, "select * from save_attendance_marks($1,1,$2)", [
      lesson.id,
      [{ student_key: bob, status: "absent", expected_revision: 1 }],
    ]);
    const event = (
      await as(
        csa,
        "select * from list_security_events(null,null,$1,'attendance_mark')",
        [bob],
      )
    )[0];
    assert.equal(event.details.after, "absent");
    assert.equal(event.actor_id, teacher);
    await as(
      null,
      "select csa_delete_account($1,$2,$3)",
      [csa, sessions.get(csa), bob],
      { role: "service_role" },
    );
    assert.ok(
      (
        await as(
          csa,
          "select * from list_security_events(null,null,$1,'account_deleted')",
          [bob],
        )
      ).length,
    );
    assert.equal(
      (
        await as(
          csa,
          "select * from list_security_events(null,null,$1,'attendance_mark')",
          [bob],
        )
      )[0].target_name,
      "Борис",
    );
    await assert.rejects(
      as(
        null,
        "select csa_delete_account($1,$2,$1)",
        [csa, sessions.get(csa)],
        { role: "service_role" },
      ),
      /другой аккаунт/,
    );
    await assert.rejects(
      as(
        null,
        "select secure_delete_student($1,$2,$3)",
        [teacher, sessions.get(alice), alice],
        { role: "service_role" },
      ),
      /Сессия отозвана/,
    );
  } finally {
    await db.close();
  }
});

test("first CSA bootstrap requires exact UUID and matching identity; staff rename cannot be used for role escalation", async () => {
  const { db, as } = await securitySetup();
  try {
    await assert.rejects(
      as(teacher, "select csa_rename_staff($1,'Подмена')", [teacher]),
      /Только CSA/,
    );
    await as(csa, "select csa_rename_staff($1,'Новое имя')", [teacher]);
    assert.equal(
      (await as(csa, "select security_accounts() accounts"))[0].accounts.find(
        (item) => item.id === teacher,
      ).name,
      "Новое имя",
    );
    await assert.rejects(
      as(csa, "select csa_rename_staff($1,'CSA')", [alice]),
      /Выберите сотрудника/,
    );
    const { readFile } = await import("node:fs/promises");
    const bootstrap = await readFile(
      new URL("../supabase/setup-csa.sql", import.meta.url),
      "utf8",
    );
    async function apply(script) {
      try {
        await db.exec(script);
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    }
    await assert.rejects(apply(bootstrap), /Замените/);
    await assert.rejects(
      apply(bootstrap.replaceAll("REPLACE_WITH_EXACT_AUTH_USER_UUID", teacher)),
      /не совпадают/,
    );
    const first = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'csa@csa.management-laboratory.invalid')",
      [first],
    );
    await assert.rejects(
      apply(bootstrap.replaceAll("REPLACE_WITH_EXACT_AUTH_USER_UUID", first)),
      /Первый CSA уже создан/,
    );
    await db.query("delete from csa_accounts where user_id=$1", [csa]);
    await apply(
      bootstrap.replaceAll("REPLACE_WITH_EXACT_AUTH_USER_UUID", first),
    );
    assert.equal(
      (await db.query("select user_id from csa_accounts")).rows[0].user_id,
      first,
    );
  } finally {
    await db.close();
  }
});
