import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const ids = Array.from(
  { length: 40 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const [teacher, admin, bob, other, newPupil, stranger] = ids;
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202611030001_classroom.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202611060001_student_administrators.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration);
  for (const id of ids)
    await db.query("insert into auth.users values($1)", [id]);
  await db.query("insert into teachers values($1,'Преподаватель')", [teacher]);
  for (const [id, name] of [
    [admin, "Администратор"],
    [bob, "Борис"],
    [other, "Второй администратор"],
  ])
    await db.query("select provision_student($1,$2,$2)", [id, name]);
  async function as(role, id, sql, params = []) {
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
  async function assign(
    id,
    limits = { capacity: 26, deleted: 5, points: 100, awards: 10 },
  ) {
    await as(
      "authenticated",
      teacher,
      "select configure_student_administrator($1,$2::jsonb)",
      [id, JSON.stringify(limits)],
    );
  }
  return { db, as, assign };
}
test("student administrator cannot escalate access, see passwords, or modify staff results; revocation is immediate", async () => {
  const { db, as, assign } = await setup();
  try {
    await assert.rejects(
      as(
        "authenticated",
        admin,
        "select configure_student_administrator($1,$2::jsonb)",
        [admin, '{"capacity":26,"deleted":5,"points":100,"awards":10}'],
      ),
      /Только преподаватель/,
    );
    await assign(admin);
    await assign(other);
    assert.equal(
      (await as("authenticated", admin, "select * from students")).length,
      3,
    );
    assert.equal(
      (await as("authenticated", bob, "select * from students")).length,
      1,
    );
    await assert.rejects(
      as("authenticated", admin, "select * from student_credentials"),
      /permission denied/i,
    );
    await assert.rejects(
      as("authenticated", teacher, "select * from student_credentials"),
      /permission denied/i,
    );
    await assert.rejects(
      as(
        "authenticated",
        admin,
        "update student_administrators set points_limit=999",
      ),
      /permission denied/i,
    );
    await assert.rejects(
      as(
        "authenticated",
        admin,
        "select consume_administrator_quota($1,'points',0)",
        [admin],
      ),
      /permission denied/i,
    );
    await assert.rejects(
      as("authenticated", admin, "select staff_delete_student($1,$2)", [
        admin,
        bob,
      ]),
      /permission denied/i,
    );
    for (const target of [admin, other]) {
      await assert.rejects(
        as("authenticated", admin, "select award_nuts($1,1)", [[target]]),
        /не может/,
      );
      await assert.rejects(
        as("authenticated", admin, "select award_achievement($1,'Сам себе')", [
          [target],
        ]),
        /не может/,
      );
      await assert.rejects(
        as("service_role", null, "select staff_delete_student($1,$2)", [
          admin,
          target,
        ]),
        /Нельзя удалить/,
      );
    }
    await as(
      "authenticated",
      teacher,
      "select configure_student_administrator($1,$2::jsonb,false)",
      [admin, "{}"],
    );
    await assert.rejects(
      as("authenticated", admin, "select award_nuts($1,1)", [[bob]]),
      /Только учитель/,
    );
    assert.equal(
      (await as("authenticated", admin, "select * from students")).length,
      1,
    );
    assert.equal(
      (
        await db.query("select count(*)::int as n from students where id=$1", [
          admin,
        ])
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await as("authenticated", bob, "select * from classroom_activity"))
        .length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("daily budgets count all recipients and absolute changes; duplicate awards do not spend quota; failed actions are atomic", async () => {
  const { db, as, assign } = await setup();
  try {
    await assign(admin);
    await as("authenticated", admin, "select award_nuts($1,30)", [
      [bob, other],
    ]);
    await assert.rejects(
      as("authenticated", admin, "select award_nuts($1,21)", [[bob, other]]),
      /Превышен дневной лимит/,
    );
    assert.equal(
      (await db.query("select nuts from students where id=$1", [bob])).rows[0]
        .nuts,
      30,
    );
    await as("authenticated", admin, "select award_nuts($1,-10)", [[bob, bob]]);
    let quota = (
      await as("authenticated", admin, "select my_administrator_quota() as q")
    )[0].q;
    assert.equal(quota.used.points, 70);
    await as("authenticated", admin, "select award_nuts($1,30)", [[bob]]);
    await assert.rejects(
      as("authenticated", admin, "select award_nuts($1,1)", [[bob]]),
      /Превышен/,
    );
    for (let i = 0; i < 2; i++)
      await as(
        "authenticated",
        admin,
        "select award_achievement($1,'Одна награда')",
        [[bob, bob]],
      );
    for (let i = 1; i < 10; i++)
      await as("authenticated", admin, "select award_achievement($1,$2)", [
        [bob],
        `Награда ${i}`,
      ]);
    const before = (
      await db.query(
        "select count(*)::int as n from classroom_activity where kind='achievement'",
      )
    ).rows[0].n;
    await assert.rejects(
      as("authenticated", admin, "select award_achievement($1,'Лишняя')", [
        [bob],
      ]),
      /Превышен/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from achievements where title='Лишняя'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from classroom_activity where kind='achievement'",
        )
      ).rows[0].n,
      before,
    );
    quota = (
      await as("authenticated", admin, "select my_administrator_quota() as q")
    )[0].q;
    assert.equal(quota.used.awards, 10);
    await as("authenticated", teacher, "select award_nuts($1,1000)", [[admin]]);
    assert.equal(
      (await db.query("select nuts from students where id=$1", [admin])).rows[0]
        .nuts,
      1000,
    );
  } finally {
    await db.close();
  }
});
test("administrator capacity frees on deletion, daily deletes stop at five, imported balances cannot bypass budgets", async () => {
  const { db, as, assign } = await setup();
  try {
    await assign(admin, { capacity: 4, deleted: 5, points: 100, awards: 10 });
    await assert.rejects(
      as(
        "service_role",
        null,
        "select staff_provision_student($1,$2,$3,$3,10)",
        [admin, newPupil, "Новый"],
      ),
      /нулевым балансом/,
    );
    await as(
      "service_role",
      null,
      "select staff_provision_student($1,$2,$3,$3,0,$4::jsonb,$5)",
      [admin, newPupil, "Новый", "[]", "encrypted-envelope"],
    );
    await assert.rejects(
      as("service_role", null, "select staff_provision_student($1,$2,$3,$3)", [
        admin,
        stranger,
        "Шестой",
      ]),
      /В классе уже/,
    );
    await as("service_role", null, "select staff_delete_student($1,$2)", [
      admin,
      bob,
    ]);
    await as(
      "service_role",
      null,
      "select staff_provision_student($1,$2,$3,$3)",
      [admin, stranger, "Шестой"],
    );
    assert.equal(
      (await db.query("select count(*)::int as n from students")).rows[0].n,
      4,
    );
    for (const id of [other, newPupil, stranger])
      await as("service_role", null, "select staff_delete_student($1,$2)", [
        admin,
        id,
      ]);
    await as(
      "service_role",
      null,
      "select staff_provision_student($1,$2,$3,$3)",
      [admin, ids[6], "Седьмой"],
    );
    await as("service_role", null, "select staff_delete_student($1,$2)", [
      admin,
      ids[6],
    ]);
    await as(
      "service_role",
      null,
      "select staff_provision_student($1,$2,$3,$3)",
      [admin, ids[7], "Восьмой"],
    );
    await assert.rejects(
      as("service_role", null, "select staff_delete_student($1,$2)", [
        admin,
        ids[7],
      ]),
      /Превышен дневной лимит/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from auth.users where id=$1",
          [ids[7]],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query("select count(*)::int as n from students where id=$1", [
          ids[7],
        ])
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from student_credentials where student_id=$1",
          [newPupil],
        )
      ).rows[0].n,
      0,
    );
    const quota = (
      await as("authenticated", admin, "select my_administrator_quota() as q")
    )[0].q;
    assert.equal(quota.used.deleted, 5);
    await as(
      "authenticated",
      teacher,
      "select configure_student_administrator($1,$2::jsonb,false)",
      [admin, "{}"],
    );
    await assign(admin, { capacity: 4, deleted: 5, points: 100, awards: 10 });
    assert.equal(
      (
        await as("authenticated", admin, "select my_administrator_quota() as q")
      )[0].q.used.deleted,
      5,
    );
  } finally {
    await db.close();
  }
});
