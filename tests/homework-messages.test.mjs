import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  setup,
  teacher,
  alice,
  bob,
  outsider,
} from "./helpers/messenger-db.mjs";
const saveSql = "select * from save_classroom_homework($1,$2,$3,$4,$5)";
const sendSql = "select * from send_student_message($1,$2,$3)";
test("homework is readable by class members, writable only by staff, versioned and logged", async () => {
  const { db, as, migrate } = await setup();
  try {
    await migrate();
    await migrate();
    const id = randomUUID();
    const args = [
      id,
      "Практическая работа",
      "Первая строка\nВторая строка",
      "2026-11-10",
      0,
    ];
    await assert.rejects(
      as(alice, saveSql, args),
      /только преподаватель или администратор/,
    );
    await assert.rejects(
      as(outsider, saveSql, args),
      /только преподаватель или администратор/,
    );
    await assert.rejects(as(null, saveSql, args, "anon"), /permission denied/i);
    await assert.rejects(
      as(
        teacher,
        "insert into classroom_homework(id,title,body,author_name) values($1,'Тест','Тест','Подмена')",
        [id],
      ),
      /permission denied/i,
    );
    let item = (await as(teacher, saveSql, args))[0];
    assert.equal(item.body, args[2]);
    assert.equal(item.revision, 1);
    assert.equal(
      (await as(alice, "select * from classroom_homework")).length,
      1,
    );
    assert.equal(
      (await as(outsider, "select * from classroom_homework")).length,
      0,
    );
    await assert.rejects(
      as(null, "select * from classroom_homework", [], "anon"),
      /permission denied/i,
    );
    assert.equal(
      (await as(teacher, saveSql, args))[0].revision,
      1,
      "same create retry does not duplicate homework or log",
    );
    assert.equal(
      (
        await db.query(
          "select * from classroom_activity where kind='homework_create'",
        )
      ).rows.length,
      1,
    );
    await as(
      teacher,
      'select configure_student_administrator($1,\'{"capacity":26,"deleted":5,"points":100,"awards":10}\')',
      [alice],
    );
    item = (await as(alice, saveSql, [id, "Изменено", "Новое ДЗ", null, 1]))[0];
    assert.equal(item.revision, 2);
    assert.equal(item.author_name, "Анна");
    await assert.rejects(
      as(teacher, saveSql, [id, "Старый редактор", "Текст", null, 1]),
      /уже изменилось/,
    );
    await assert.rejects(
      as(bob, "select archive_classroom_homework($1,true,2)", [id]),
      /только преподаватель или администратор/,
    );
    await as(alice, "select archive_classroom_homework($1,true,2)", [id]);
    assert.equal(
      (await as(bob, "select * from classroom_homework where not archived"))
        .length,
      0,
    );
    await assert.rejects(
      as(teacher, "select archive_classroom_homework($1,false,2)", [id]),
      /уже изменилось/,
    );
    await as(teacher, "select archive_classroom_homework($1,false,3)", [id]);
    assert.equal(
      (await as(bob, "select * from classroom_homework where not archived"))[0]
        .revision,
      4,
    );
    await assert.rejects(
      as(teacher, saveSql, [randomUUID(), "  ", "Текст", null, 0]),
      /Название задания/,
    );
    await assert.rejects(
      as(teacher, saveSql, [randomUUID(), "Тест", "\n \t", null, 0]),
      /Текст задания/,
    );
    await assert.rejects(
      as(teacher, saveSql, [randomUUID(), "Тест", "a".repeat(6001), null, 0]),
      /Текст задания/,
    );
    await as(
      teacher,
      'select configure_student_administrator($1,\'{"capacity":26,"deleted":5,"points":100,"awards":10}\',false)',
      [alice],
    );
    await assert.rejects(
      as(alice, saveSql, [id, "Изменено", "Снова", null, 4]),
      /только преподаватель или администратор/,
    );
    const kinds = (
      await db.query(
        "select kind from classroom_activity where kind like 'homework_%' order by created_at,id",
      )
    ).rows.map((r) => r.kind);
    assert.deepEqual(kinds.sort(), [
      "homework_archive",
      "homework_create",
      "homework_edit",
      "homework_restore",
    ]);
  } finally {
    await db.close();
  }
});
test("text messages preserve old emoji, remain private, retry safely and share read state", async () => {
  const { db, as, migrate } = await setup();
  try {
    const old = (
      await as(alice, "select * from send_student_emoji($1,'💩',$2)", [
        bob,
        randomUUID(),
      ])
    )[0];
    await migrate();
    await migrate();
    await db.exec(
      "update student_emoji_messages set sent_at=now()-interval '2 seconds'",
    );
    const nonce = randomUUID();
    const content = "Привет!\n<script>alert('x')</script> 😀";
    const item = (await as(alice, sendSql, [bob, `  ${content}  `, nonce]))[0];
    assert.equal(item.body, content);
    assert.equal(item.emoji, null);
    assert.equal(
      (await as(alice, sendSql, [bob, content, nonce]))[0].id,
      item.id,
    );
    await assert.rejects(
      as(alice, sendSql, [bob, "Другой текст", nonce]),
      /запрос уже использован/,
    );
    const thread = await as(bob, "select * from student_emoji_thread($1)", [
      alice,
    ]);
    assert.equal(thread.length, 2);
    assert.equal(thread.find((m) => m.id === old.id).emoji, "💩");
    assert.equal(
      (await as(teacher, "select * from student_emoji_messages")).length,
      0,
    );
    assert.equal(
      (await as(outsider, "select * from student_emoji_messages")).length,
      0,
    );
    await assert.rejects(
      as(teacher, sendSql, [bob, "Привет", randomUUID()]),
      /только ученикам/,
    );
    await assert.rejects(
      as(alice, sendSql, [teacher, "Привет", randomUUID()]),
      /другого ученика/,
    );
    await assert.rejects(
      as(outsider, sendSql, [bob, "Привет", randomUUID()]),
      /только ученикам/,
    );
    await assert.rejects(
      as(null, sendSql, [bob, "Привет", randomUUID()], "anon"),
      /permission denied/i,
    );
    await assert.rejects(
      as(alice, "select deliver_student_chat($1,null,'Подмена',$2)", [
        bob,
        randomUUID(),
      ]),
      /permission denied/i,
    );
    await assert.rejects(
      as(alice, "update student_emoji_messages set body='Подмена'"),
      /permission denied/i,
    );
    await assert.rejects(
      as(alice, sendSql, [bob, "  \n\t", randomUUID()]),
      /от 1 до 2000/,
    );
    await assert.rejects(
      as(alice, sendSql, [bob, "x".repeat(2001), randomUUID()]),
      /от 1 до 2000/,
    );
    await assert.rejects(
      as(alice, "select * from send_student_emoji($1,'🔥',$2)", [
        bob,
        randomUUID(),
      ]),
      /чуть позже/,
    );
    let state = (await as(bob, "select student_emoji_state() as state"))[0]
      .state;
    assert.equal(state.peers[0].last_body, content);
    assert.equal(state.peers[0].last_emoji, null);
    assert.equal(state.peers[0].unread, 2);
    assert.equal(state.incoming.length, 0);
    state = (
      await as(bob, "select student_emoji_state($1) as state", [old.id])
    )[0].state;
    assert.equal(state.incoming[0].body, content);
    await as(bob, "select mark_student_emoji_read($1,$2)", [alice, item.id]);
    state = (await as(bob, "select student_emoji_state() as state"))[0].state;
    assert.equal(state.peers[0].unread, 0);
    await as(bob, "select block_student_emojis($1,true)", [alice]);
    await assert.rejects(
      as(alice, sendSql, [bob, "Привет", randomUUID()]),
      /недоступна/,
    );
    await assert.rejects(
      as(bob, sendSql, [alice, "Привет", randomUUID()]),
      /недоступна/,
    );
  } finally {
    await db.close();
  }
});
test("emoji and text use one message budget, valid long Unicode text is preserved", async () => {
  const { db, as, migrate } = await setup();
  try {
    await migrate();
    const text = "😀".repeat(2000);
    const item = (await as(alice, sendSql, [bob, text, randomUUID()]))[0];
    assert.equal(item.body, text);
    await db.exec(
      "update student_emoji_messages set sent_at=now()-interval '2 seconds'",
    );
    for (let i = 0; i < 29; i++)
      await db.query(
        "insert into student_emoji_messages(sender_id,recipient_id,emoji,client_nonce,sent_at) values($1,$2,'👏',$3,now()-interval '2 seconds')",
        [alice, bob, randomUUID()],
      );
    await assert.rejects(
      as(alice, sendSql, [bob, "Ещё", randomUUID()]),
      /Подождите минуту/,
    );
    await assert.rejects(
      as(alice, "select * from send_student_emoji($1,'🔥',$2)", [
        bob,
        randomUUID(),
      ]),
      /Подождите минуту/,
    );
    await db.exec(
      "update student_emoji_messages set sent_at=now()-interval '2 minutes'",
    );
    for (let i = 30; i < 500; i++)
      await db.query(
        "insert into student_emoji_messages(sender_id,recipient_id,emoji,client_nonce,sent_at) values($1,$2,'👏',$3,now()-interval '2 minutes')",
        [alice, bob, randomUUID()],
      );
    await assert.rejects(
      as(alice, sendSql, [bob, "Лимит", randomUUID()]),
      /завтра/,
    );
  } finally {
    await db.close();
  }
});
