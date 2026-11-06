import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
const ids = Array.from(
  { length: 6 },
  (_, i) => `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const [teacher, alice, bob, carol, stranger] = ids;
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for (const file of [
    "202611030001_classroom.sql",
    "202611060001_student_administrators.sql",
    "202611060002_emoji_chats.sql",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202611060002_emoji_chats.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const id of ids)
    await db.query("insert into auth.users values($1)", [id]);
  await db.query("insert into teachers values($1,'Учитель')", [teacher]);
  for (const [id, name] of [
    [teacher, "Учитель"],
    [alice, "Анна"],
    [bob, "Борис"],
    [carol, "Вера"],
  ])
    await db.query("select provision_student($1,$2,$2)", [id, name]);
  async function as(id, sql, params = [], role = "authenticated") {
    await db.exec("begin");
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        id ?? "",
      ]);
      const result = await db.query(sql, params);
      await db.exec("commit");
      return result.rows;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  }
  async function send(from, to, emoji = "💩", nonce = randomUUID()) {
    return (
      await as(from, "select (send_student_emoji($1,$2,$3)).*", [
        to,
        emoji,
        nonce,
      ])
    )[0];
  }
  return { db, as, send };
}
test("only pupils exchange allowlisted emoji, staff cannot read others conversations or receive emoji", async () => {
  const { db, as, send } = await setup();
  try {
    await assert.rejects(
      as(null, "select * from student_emoji_messages", [], "anon"),
      /permission denied/i,
    );
    await assert.rejects(
      as(null, "select student_emoji_state()", [], "anon"),
      /permission denied/i,
    );
    await assert.rejects(send(teacher, alice), /только ученикам/);
    await assert.rejects(
      as(teacher, "select student_emoji_state()"),
      /только ученикам/,
    );
    await assert.rejects(send(alice, teacher), /другого ученика/);
    await assert.rejects(send(stranger, alice), /только ученикам/);
    await assert.rejects(send(alice, alice), /другого ученика/);
    await assert.rejects(send(alice, bob, "<script>"), /Выберите эмодзи/);
    const message = await send(alice, bob);
    assert.equal(message.emoji, "💩");
    assert.equal(
      (await as(bob, "select * from student_emoji_thread($1)", [alice])).length,
      1,
    );
    assert.equal(
      (await as(carol, "select * from student_emoji_messages")).length,
      0,
    );
    assert.equal(
      (await as(teacher, "select * from student_emoji_messages")).length,
      0,
    );
    await as(
      teacher,
      'select configure_student_administrator($1,\'{"capacity":26,"deleted":5,"points":100,"awards":10}\')',
      [alice],
    );
    await send(bob, carol, "❤️");
    assert.equal(
      (await as(alice, "select * from student_emoji_messages")).length,
      1,
    );
    const state = (await as(alice, "select student_emoji_state() as state"))[0]
      .state;
    assert.deepEqual(
      state.peers.map((peer) => peer.id).sort(),
      [bob, carol].sort(),
    );
    assert.equal("nuts" in state.peers[0], false);
    await assert.rejects(
      as(
        alice,
        "insert into student_emoji_messages(sender_id,recipient_id,emoji,client_nonce) values($1,$2,'💩',$3)",
        [bob, carol, randomUUID()],
      ),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});
test("network retries are idempotent and rate limits cannot be bypassed by client IDs", async () => {
  const { db, send } = await setup();
  try {
    const nonce = randomUUID();
    const first = await send(alice, bob, "💩", nonce);
    const again = await send(alice, bob, "💩", nonce);
    assert.equal(first.id, again.id);
    assert.equal(
      (await db.query("select count(*)::int as n from student_emoji_messages"))
        .rows[0].n,
      1,
    );
    await assert.rejects(
      send(alice, carol, "🔥", nonce),
      /запрос уже использован/,
    );
    await assert.rejects(send(alice, bob, "🔥"), /чуть позже/);
    await db.query(
      "update student_emoji_messages set sent_at=now()-interval '2 seconds'",
    );
    for (let i = 1; i < 30; i++)
      await db.query(
        "insert into student_emoji_messages(sender_id,recipient_id,emoji,client_nonce,sent_at) values($1,$2,'👏',$3,now()-interval '2 seconds')",
        [alice, bob, randomUUID()],
      );
    await assert.rejects(send(alice, bob, "👏"), /Подождите минуту/);
    assert.equal(
      (await db.query("select count(*)::int as n from student_emoji_messages"))
        .rows[0].n,
      30,
    );
  } finally {
    await db.close();
  }
});
test("unread positions are private, bounded to received messages and monotonic; fresh startup does not replay old bursts", async () => {
  const { db, as, send } = await setup();
  try {
    const first = await send(alice, bob);
    let state = (await as(bob, "select student_emoji_state() as state"))[0]
      .state;
    assert.equal(state.incoming.length, 0);
    assert.equal(state.peers.find((p) => p.id === alice).unread, 1);
    const cursor = state.cursor;
    await as(bob, "select mark_student_emoji_read($1,$2)", [alice, 999999]);
    assert.equal(
      Number(
        (await as(bob, "select * from student_emoji_reads"))[0].through_id,
      ),
      Number(first.id),
    );
    assert.equal(
      (await as(alice, "select * from student_emoji_reads")).length,
      0,
    );
    await db.query(
      "update student_emoji_messages set sent_at=now()-interval '2 seconds'",
    );
    const second = await send(alice, bob, "😂");
    state = (
      await as(bob, "select student_emoji_state($1) as state", [cursor])
    )[0].state;
    assert.equal(state.incoming.length, 1);
    assert.equal(Number(state.incoming[0].id), Number(second.id));
    await as(bob, "select mark_student_emoji_read($1,$2)", [alice, first.id]);
    assert.equal(
      Number(
        (await as(bob, "select * from student_emoji_reads"))[0].through_id,
      ),
      Number(first.id),
    );
    await as(bob, "select mark_student_emoji_read($1,$2)", [alice, second.id]);
    await as(bob, "select mark_student_emoji_read($1,$2)", [alice, first.id]);
    state = (await as(bob, "select student_emoji_state() as state"))[0].state;
    assert.equal(state.peers.find((p) => p.id === alice).unread, 0);
    assert.equal(
      Number(
        (await as(bob, "select * from student_emoji_reads"))[0].through_id,
      ),
      Number(second.id),
    );
  } finally {
    await db.close();
  }
});
test("blocking stops delivery in both directions, exposes no other block lists, and pupil deletion cleans up chats", async () => {
  const { db, as, send } = await setup();
  try {
    await send(alice, bob);
    await as(bob, "select block_student_emojis($1,true)", [alice]);
    await assert.rejects(send(alice, bob, "🔥"), /недоступна/);
    await assert.rejects(send(bob, alice, "🔥"), /недоступна/);
    assert.equal(
      (await as(alice, "select * from student_emoji_blocks")).length,
      0,
    );
    const state = (await as(bob, "select student_emoji_state() as state"))[0]
      .state;
    assert.equal(state.peers.find((p) => p.id === alice).blocked, true);
    assert.equal(state.peers.find((p) => p.id === alice).unread, 0);
    await assert.rejects(
      as(alice, "delete from student_emoji_blocks"),
      /permission denied/i,
    );
    await as(bob, "select block_student_emojis($1,false)", [alice]);
    await send(bob, alice, "❤️");
    await db.query("delete from auth.users where id=$1", [alice]);
    assert.equal(
      (await db.query("select count(*)::int as n from student_emoji_messages"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from student_emoji_blocks"))
        .rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
