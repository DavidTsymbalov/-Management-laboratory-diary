import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import {
  securitySetup,
  teacher,
  alice,
  bob,
  outsider,
  csa,
} from "./helpers/security-db.mjs";
const read = promisify(readFile);
const pdf = "application/pdf";
const pptx =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const saveSql =
  "select save_lesson_materials($1,$2,$3,$4,$5,$6,$7,$8::jsonb) id";
const listSql = "select list_classroom_lessons('2026-11-01') data";
const link = () => ({
  id: randomUUID(),
  title: "Материалы",
  kind: "link",
  url: "https://example.com/presentation",
});
async function setup() {
  const ctx = await securitySetup();
  await ctx.db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;`);
  const migration = await read(
    new URL(
      "../supabase/migrations/202611120001_lesson_materials.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await ctx.db.exec(migration);
  await ctx.db.exec(migration);
  async function file(type = pdf, owner = teacher) {
    const item = {
      id: randomUUID(),
      title: "Презентация",
      kind: "file",
      storage_path: `${owner}/${randomUUID()}.${type === pdf ? "pdf" : "pptx"}`,
      file_name: type === pdf ? "Материалы.pdf" : "Материалы.pptx",
      mime_type: type,
      size_bytes: 1024,
    };
    await ctx.as(
      owner,
      "insert into storage.objects(bucket_id,name,metadata) values('lesson-presentations',$1,$2)",
      [item.storage_path, { mimetype: type, size: 1024 }],
    );
    return item;
  }
  const save = async (
    id = teacher,
    {
      date = "2026-11-12",
      title = "Постановка целей",
      body = "Разобрали SMART",
      homework = "Сформулировать цель",
      due = "2026-11-19",
      published = true,
      revision = 0,
      presentations = [],
    } = {},
  ) =>
    (
      await ctx.as(id, saveSql, [
        date,
        title,
        body,
        homework,
        due,
        published,
        revision,
        presentations,
      ])
    )[0].id;
  const list = async (id) => (await ctx.as(id, listSql))[0].data;
  return { ...ctx, save, list, file };
}
test("teacher publishes several presentations and lesson homework; students see materials without attendance or editing rights", async () => {
  const { db, as, save, list, file, sessions } = await setup();
  try {
    const first = await file(),
      second = await file(pptx);
    const id = await save(teacher, { presentations: [first, second, link()] });
    const lessons = await list(alice);
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].id, id);
    assert.equal(lessons[0].presentations.length, 3);
    assert.equal(lessons[0].homework, "Сформулировать цель");
    assert.equal(lessons[0].homework_due, "2026-11-19");
    assert.equal((await as(alice, "select * from storage.objects")).length, 2);
    assert.equal(
      (await as(alice, "select * from attendance_records")).length,
      0,
    );
    await as(teacher, "select configure_student_administrator($1,$2)", [
      alice,
      { capacity: 26, deleted: 5, points: 100, awards: 10 },
    ]);
    for (const user of [alice, bob, outsider]) {
      await assert.rejects(
        save(user, { date: "2026-11-19" }),
        /только преподаватель/,
      );
      await assert.rejects(file(pdf, user), /row-level security/i);
      await assert.rejects(
        as(user, "update lesson_content set title='Changed'"),
        /permission denied/i,
      );
    }
    await assert.rejects(list(outsider), /участника класса/);
    await assert.rejects(
      as(null, listSql, [], { role: "anon" }),
      /permission denied/i,
    );
    const event = (
      await as(
        teacher,
        "select * from list_security_events(null,null,null,'lesson_materials_save')",
      )
    )[0];
    assert.equal(event.actor_id, teacher);
    assert.equal(event.session_id, sessions.get(teacher));
    assert.equal(event.target_id, id);
    assert.equal(event.details.presentations, 3);
    await as(csa, "select revoke_security_session($1)", [sessions.get(bob)]);
    await assert.rejects(list(bob), /участника класса/);
    assert.equal((await as(bob, "select * from storage.objects")).length, 0);
    assert.equal((await as(bob, "select * from lesson_content")).length, 0);
  } finally {
    await db.close();
  }
});
test("drafts and files remain private; attached uploads survive cleanup and detached uploads can be removed", async () => {
  const { db, as, save, list, file } = await setup();
  try {
    const attachment = await file();
    await save(teacher, { published: false, presentations: [attachment] });
    assert.equal((await list(alice)).length, 0);
    assert.equal((await list(teacher)).length, 1);
    assert.equal(
      (await as(alice, "select * from lesson_presentations")).length,
      0,
    );
    assert.equal((await as(alice, "select * from storage.objects")).length, 0);
    assert.equal(
      (await as(teacher, "delete from storage.objects returning id")).length,
      0,
      "cleanup cannot delete an attachment after an ambiguous successful save",
    );
    await save(csa, { revision: 1, presentations: [attachment] });
    assert.equal((await list(alice)).length, 1);
    assert.equal((await as(alice, "select * from storage.objects")).length, 1);
    await save(teacher, {
      revision: 2,
      published: false,
      presentations: [attachment],
    });
    assert.equal((await as(alice, "select * from storage.objects")).length, 0);
    await save(teacher, { revision: 3, presentations: [] });
    assert.equal(
      (await as(teacher, "delete from storage.objects returning id")).length,
      1,
    );
  } finally {
    await db.close();
  }
});
test("lesson edits are atomic, reject stale or forged attachments and retain existing attendance marks", async () => {
  const { db, as, save, list, file } = await setup();
  try {
    const [lesson] = await as(
      teacher,
      "select * from create_attendance_lessons(array['2026-11-12'::date])",
    );
    await as(teacher, "select * from save_attendance_marks($1,1,$2::jsonb)", [
      lesson.id,
      [{ student_key: alice, status: "present", expected_revision: 1 }],
    ]);
    const attachment = await file();
    assert.equal(
      await save(teacher, { presentations: [attachment] }),
      lesson.id,
    );
    const marksBefore = await as(
      teacher,
      "select * from attendance_records order by student_key",
    );
    const baseline = await list(alice);
    for (const presentations of [
      [
        link(),
        { ...attachment, storage_path: `${teacher}/${randomUUID()}.pdf` },
      ],
      [{ ...link(), url: "javascript:alert(1)" }],
      [{ ...link(), url: "https://user:password@example.com/" }],
      [{ ...attachment, size_bytes: 26214401 }],
      [{ ...attachment, mime_type: "text/html" }],
      [attachment, attachment],
    ])
      await assert.rejects(
        save(teacher, {
          revision: 1,
          title: "Should roll back",
          presentations,
        }),
      );
    await assert.rejects(
      save(teacher, { revision: 0, title: "Stale" }),
      /уже изменились/,
    );
    assert.deepEqual(await list(alice), baseline);
    assert.deepEqual(
      await as(
        teacher,
        "select * from attendance_records order by student_key",
      ),
      marksBefore,
    );
    await assert.rejects(
      save(teacher, { date: "2026-11-19", presentations: [attachment] }),
      /уже используется|уже прикреплён/,
    );
    assert.equal(
      (await list(teacher)).length,
      1,
      "invalid save rolls back new attendance date too",
    );
    await save(teacher, {
      revision: 1,
      title: "Обновлённая тема",
      presentations: [attachment, link()],
    });
    assert.equal((await list(alice))[0].revision, 2);
  } finally {
    await db.close();
  }
});

const context = { exports: {}, URL };
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../src/lib/lesson-materials.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  context,
);
const model = context.exports;
test("lesson form validates calendar dates, HTTPS links and file limits before uploading", () => {
  const draft = {
    lesson_date: "2026-11-12",
    title: "Тема",
    body: "",
    homework: "",
    homework_due: "",
    presentations: [],
  };
  assert.equal(model.lessonDraftError(draft), null);
  for (const date of ["2026-02-30", "invalid", "2026-13-01"])
    assert.ok(model.lessonDraftError({ ...draft, lesson_date: date }));
  assert.ok(model.lessonDraftError({ ...draft, homework_due: "2026-02-30" }));
  assert.ok(model.lessonDraftError({ ...draft, homework_due: "2026-11-11" }));
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://x:y@example.com",
    "",
  ])
    assert.equal(model.presentationLink(url), null);
  assert.equal(
    model.presentationLink(" https://example.com/урок "),
    "https://example.com/%D1%83%D1%80%D0%BE%D0%BA",
  );
  assert.equal(
    model.presentationFileError({ name: "урок.PDF", size: 26214400 }),
    null,
  );
  for (const file of [
    { name: "x.html", size: 1 },
    { name: "x.pdf", size: 0 },
    { name: "x.pptx", size: 26214401 },
  ])
    assert.ok(model.presentationFileError(file));
});
