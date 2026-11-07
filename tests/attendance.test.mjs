import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  setup,
  teacher,
  alice,
  bob,
  outsider,
} from "./helpers/messenger-db.mjs";
async function register() {
  const context = await setup();
  await context.migrate();
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202611070001_attendance.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await context.db.exec(migration);
  await context.db.exec(migration);
  return context;
}
const caps = { capacity: 26, deleted: 5, points: 100, awards: 10 };
const create = "select * from create_attendance_lessons($1::date[])";
const marks = "select * from save_attendance_marks($1,$2,$3::jsonb)";
const change = (id, status, revision = 1) => ({
  student_key: id,
  status,
  expected_revision: revision,
});
test("staff-only register creates Thursday lessons idempotently and preserves historical names after pupil deletion", async () => {
  const { db, as } = await register();
  try {
    await assert.rejects(
      as(null, create, [["2026-11-12"]], "anon"),
      /permission denied/i,
    );
    for (const id of [alice, bob, outsider])
      await assert.rejects(
        as(id, create, [["2026-11-12"]]),
        /преподавателю и администратору/,
      );
    await assert.rejects(
      as(
        teacher,
        "insert into attendance_lessons(lesson_date) values('2026-11-12')",
      ),
      /permission denied/i,
    );
    const lessons = await as(teacher, create, [
      ["2026-11-12", "2026-11-19", "2026-11-12"],
    ]);
    assert.equal(lessons.length, 2);
    await as(teacher, create, [["2026-11-12"]]);
    assert.equal(
      (
        await db.query(
          "select * from classroom_activity where kind='lesson_create'",
        )
      ).rows.length,
      2,
    );
    assert.equal(
      (await as(teacher, "select * from attendance_records")).length,
      4,
    );
    for (const id of [alice, bob, outsider]) {
      assert.equal(
        (await as(id, "select * from attendance_lessons")).length,
        0,
      );
      assert.equal(
        (await as(id, "select * from attendance_records")).length,
        0,
      );
    }
    const snapshot = (
      await as(teacher, "select load_attendance_month('2026-11-01') as data")
    )[0].data;
    assert.equal(snapshot.lessons.length, 2);
    assert.equal(snapshot.records.length, 4);
    assert.equal(
      (
        await as(teacher, "select load_attendance_month('2026-12-01') as data")
      )[0].data.lessons.length,
      0,
    );
    await assert.rejects(
      as(alice, "select load_attendance_month('2026-11-01')"),
      /преподавателю и администратору/,
    );
    await assert.rejects(
      as(null, "select load_attendance_month('2026-11-01')", [], "anon"),
      /permission denied/i,
    );
    await as(teacher, marks, [lessons[0].id, 1, [change(bob, "present")]]);
    await db.query("delete from auth.users where id=$1", [bob]);
    const historical = (
      await as(
        teacher,
        "select * from attendance_records where lesson_id=$1 and student_key=$2",
        [lessons[0].id, bob],
      )
    )[0];
    assert.equal(historical.student_name, "Борис");
    assert.equal(historical.status, "present");
    await as(teacher, marks, [lessons[0].id, 1, [change(bob, "excused", 2)]]);
    assert.equal(
      (
        await db.query(
          "select status from attendance_records where lesson_id=$1 and student_key=$2",
          [lessons[0].id, bob],
        )
      ).rows[0].status,
      "excused",
    );
  } finally {
    await db.close();
  }
});
test("administrator edits attendance without consuming points budgets; cancellation preserves marks and prevents writes until restored", async () => {
  const { db, as } = await register();
  try {
    await as(teacher, "select configure_student_administrator($1,$2)", [
      alice,
      caps,
    ]);
    let lesson = (await as(alice, create, [["2026-11-12"]]))[0];
    await as(alice, marks, [
      lesson.id,
      1,
      [change(alice, "late"), change(bob, "absent")],
    ]);
    assert.equal(
      (await as(alice, "select * from attendance_records")).length,
      2,
    );
    assert.equal(
      (await db.query("select * from administrator_usage")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select nuts from students where id=$1", [bob])).rows[0]
        .nuts,
      0,
    );
    lesson = (
      await as(
        alice,
        "select * from set_attendance_lesson_state($1,true,'Каникулы',1)",
        [lesson.id],
      )
    )[0];
    assert.equal(lesson.cancelled, true);
    assert.equal(lesson.revision, 2);
    await assert.rejects(
      as(alice, marks, [lesson.id, 2, [change(bob, "present", 2)]]),
      /Занятие отменено/,
    );
    await as(teacher, create, [["2026-11-12"]]);
    assert.equal(
      (await as(teacher, "select * from attendance_lessons"))[0].cancelled,
      true,
      "re-adding a date cannot silently restore cancellation",
    );
    assert.equal(
      (
        await as(
          teacher,
          "select status from attendance_records where student_key=$1",
          [bob],
        )
      )[0].status,
      "absent",
    );
    await assert.rejects(
      as(
        teacher,
        "select * from set_attendance_lesson_state($1,false,null,1)",
        [lesson.id],
      ),
      /уже изменилось/,
    );
    lesson = (
      await as(
        teacher,
        "select * from set_attendance_lesson_state($1,false,null,2)",
        [lesson.id],
      )
    )[0];
    assert.equal(lesson.cancelled, false);
    assert.equal(lesson.revision, 3);
    await assert.rejects(
      as(alice, marks, [lesson.id, 1, [change(bob, "present", 2)]]),
      /уже изменилось/,
    );
    await as(alice, marks, [lesson.id, 3, [change(bob, "present", 2)]]);
    await as(teacher, "select configure_student_administrator($1,$2,false)", [
      alice,
      caps,
    ]);
    await assert.rejects(
      as(alice, marks, [lesson.id, 3, [change(bob, "absent", 3)]]),
      /преподавателю и администратору/,
    );
    assert.equal(
      (await as(alice, "select * from attendance_records")).length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("attendance batches are atomic, reject stale revisions and invalid input, and support clearing and newly joined pupils", async () => {
  const { db, as } = await register();
  try {
    const lesson = (await as(teacher, create, [["2026-11-12"]]))[0];
    await as(teacher, marks, [lesson.id, 1, [change(bob, "present")]]);
    await assert.rejects(
      as(teacher, marks, [
        lesson.id,
        1,
        [change(alice, "late"), change(bob, "absent")],
      ]),
      /уже изменена/,
    );
    assert.equal(
      (
        await db.query(
          "select status from attendance_records where student_key=$1",
          [alice],
        )
      ).rows[0].status,
      null,
      "first row is rolled back when a later row conflicts",
    );
    await as(teacher, marks, [lesson.id, 1, [change(bob, "present")]]);
    assert.equal(
      (
        await db.query(
          "select revision from attendance_records where student_key=$1",
          [bob],
        )
      ).rows[0].revision,
      2,
      "same network retry is idempotent",
    );
    await as(teacher, marks, [lesson.id, 1, [change(bob, null, 2)]]);
    assert.equal(
      (
        await db.query(
          "select status from attendance_records where student_key=$1",
          [bob],
        )
      ).rows[0].status,
      null,
    );
    await assert.rejects(
      as(teacher, marks, [lesson.id, 1, [change(alice, "invalid")]]),
      /из списка/,
    );
    await assert.rejects(
      as(teacher, marks, [
        lesson.id,
        1,
        [change(alice, "present"), change(alice, "absent")],
      ]),
      /несколько раз/,
    );
    await assert.rejects(
      as(teacher, marks, [lesson.id, 1, [change(outsider, "present", 0)]]),
      /не найден/,
    );
    await db.query("select provision_student($1,'Новый','Новый')", [outsider]);
    await as(teacher, marks, [lesson.id, 1, [change(outsider, "present", 0)]]);
    assert.equal(
      (
        await db.query(
          "select student_name from attendance_records where student_key=$1",
          [outsider],
        )
      ).rows[0].student_name,
      "Новый",
    );
    await assert.rejects(
      as(teacher, marks, [lesson.id, 1, { student_key: alice }]),
      /Выберите отметки/,
    );
    await assert.rejects(
      as(teacher, marks, [
        lesson.id,
        1,
        [{ student_key: alice, status: "present", expected_revision: -1 }],
      ]),
      /Некорректная/,
    );
    await assert.rejects(as(teacher, create, [[null]]), /Выберите от/);
    await assert.rejects(
      as(teacher, "update attendance_records set status='present'"),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});
