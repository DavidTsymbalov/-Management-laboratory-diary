import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  securitySetup,
  teacher,
  alice,
  bob,
  csa,
  outsider,
} from "./helpers/security-db.mjs";
async function setup() {
  const context = await securitySetup();
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202611070004_message_deletion_remarks.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await context.db.exec(migration);
  await context.db.exec(migration);
  return context;
}
test("only sender deletes a message for both participants, content is removed and retries cannot resurrect it or bypass rate limits", async () => {
  const { db, as } = await setup();
  try {
    await db.query("select provision_student($1,'Третий','третий')", [
      outsider,
    ]);
    const nonce = randomUUID();
    const sent = (
      await as(
        alice,
        "select * from send_student_message($1,'PRIVATE_CHAT_TEXT',$2)",
        [bob, nonce],
      )
    )[0];
    for (const id of [bob, outsider, teacher, csa])
      await assert.rejects(
        as(id, "select * from delete_student_message($1)", [sent.id]),
      );
    await assert.rejects(
      as(alice, "delete from student_emoji_messages where id=$1", [sent.id]),
      /permission denied/i,
    );
    const deleted = (
      await as(alice, "select * from delete_student_message($1)", [sent.id])
    )[0];
    assert.equal(deleted.body, null);
    assert.equal(deleted.emoji, null);
    assert.ok(deleted.deleted_at);
    assert.equal(deleted.client_nonce, nonce);
    assert.equal(
      (await as(bob, "select * from student_emoji_thread($1)", [alice]))[0]
        .body,
      null,
    );
    assert.equal(
      (
        await as(alice, "select * from delete_student_message($1)", [sent.id])
      )[0].change_id,
      deleted.change_id,
    );
    await assert.rejects(
      as(
        alice,
        "select * from send_student_message($1,'PRIVATE_CHAT_TEXT',$2)",
        [bob, nonce],
      ),
      /запрос уже использован/,
    );
    await assert.rejects(
      as(alice, "select * from send_student_message($1,'next',$2)", [
        bob,
        randomUUID(),
      ]),
      /чуть позже/,
    );
    const state = (
      await as(bob, "select student_chat_state(999999,0) state")
    )[0].state;
    assert.equal(
      state.changes[0].id,
      Number(sent.id),
      "deletion arrives even when message cursor has advanced",
    );
    assert.equal(state.peers.find((peer) => peer.id === alice).unread, 0);
    assert.ok(state.peers.find((peer) => peer.id === alice).last_deleted_at);
    const own = (await as(alice, "select student_chat_state(null,0) state"))[0]
      .state;
    assert.equal(
      own.changes.length,
      1,
      "other sender devices also receive deletion",
    );
    assert.equal(
      (await as(outsider, "select student_chat_state(null,0) state"))[0].state
        .changes.length,
      0,
    );
    const logs = await as(
      teacher,
      "select * from list_security_events(null,null,null,'chat_message_deleted')",
    );
    assert.equal(logs.length, 1);
    assert.ok(!JSON.stringify(logs).includes("PRIVATE_CHAT_TEXT"));
  } finally {
    await db.close();
  }
});
test("remarks are teacher/CSA-only, private to recipient, idempotent on send and persist dismissal only after recipient action", async () => {
  const { db, as, sessions } = await setup();
  try {
    await as(teacher, "select configure_student_administrator($1,$2)", [
      alice,
      { capacity: 26, deleted: 5, points: 100, awards: 10 },
    ]);
    for (const id of [alice, bob, outsider])
      await assert.rejects(
        as(id, "select * from send_student_remark($1,$2,$3)", [
          randomUUID(),
          bob,
          "test",
        ]),
        /только преподаватель/,
      );
    const nonce = randomUUID(),
      body = "  Замечание\r\nНе забудь работу <script>текст</script>  ";
    const remark = (
      await as(teacher, "select * from send_student_remark($1,$2,$3)", [
        nonce,
        bob,
        body,
      ])
    )[0];
    assert.equal(
      remark.body,
      "Замечание\nНе забудь работу <script>текст</script>",
    );
    assert.equal(remark.dismissed_at, null);
    assert.equal(
      (
        await as(teacher, "select * from send_student_remark($1,$2,$3)", [
          nonce,
          bob,
          body,
        ])
      )[0].id,
      remark.id,
    );
    await assert.rejects(
      as(teacher, "select * from send_student_remark($1,$2,$3)", [
        nonce,
        bob,
        "changed",
      ]),
      /запрос уже использован/,
    );
    assert.equal((await as(alice, "select * from student_remarks")).length, 0);
    assert.equal(
      (await as(outsider, "select * from student_remarks")).length,
      0,
    );
    assert.equal((await as(bob, "select * from student_remarks")).length, 1);
    for (const id of [alice, teacher, csa])
      await assert.rejects(
        as(id, "select * from dismiss_student_remark($1)", [remark.id]),
      );
    await assert.rejects(
      as(bob, "update student_remarks set dismissed_at=now()"),
      /permission denied/i,
    );
    const closed = (
      await as(bob, "select * from dismiss_student_remark($1)", [remark.id])
    )[0];
    assert.ok(closed.dismissed_at);
    assert.equal(
      (
        await as(
          bob,
          "select * from student_remarks where dismissed_at is null",
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await as(bob, "select * from dismiss_student_remark($1)", [remark.id])
      )[0].dismissed_at.getTime(),
      closed.dismissed_at.getTime(),
    );
    await as(csa, "select * from send_student_remark($1,$2,$3)", [
      randomUUID(),
      alice,
      "CSA note",
    ]);
    const logs = await as(
      teacher,
      "select * from list_security_events(null,null,null,'remark_dismissed')",
    );
    assert.equal(logs.length, 1);
    assert.equal(logs[0].actor_id, bob);
    await as(csa, "select revoke_security_session($1)", [sessions.get(alice)]);
    assert.equal((await as(alice, "select * from student_remarks")).length, 0);
    await assert.rejects(
      as(alice, "select * from dismiss_student_remark($1)", [remark.id]),
      /Сессия отозвана/,
    );
  } finally {
    await db.close();
  }
});
