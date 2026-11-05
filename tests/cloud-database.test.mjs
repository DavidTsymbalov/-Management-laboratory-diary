import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const teacher = "00000000-0000-4000-8000-000000000001";
const alice = "00000000-0000-4000-8000-000000000002";
const bob = "00000000-0000-4000-8000-000000000003";
const stranger = "00000000-0000-4000-8000-000000000004";
const administrator = "00000000-0000-4000-8000-000000000005";
const secondAdministrator = "00000000-0000-4000-8000-000000000006";

test("classroom RLS, privileged RPCs, atomic awards, ranking and account deletion", async () => {
  const db = new PGlite();
  try {
    // Minimal Supabase Auth environment; actual application migration stays unchanged.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/202611030001_classroom.sql", import.meta.url), "utf8"));
    await db.query("insert into auth.users(id) values ($1), ($2), ($3), ($4)", [teacher, alice, bob, stranger]);
    await db.query("insert into teachers values ($1, 'Учитель')", [teacher]);
    await db.query("select provision_student($1, 'Анна', 'анна', 5, $2::jsonb)", [alice, '[{"title":"Первый шаг","icon":"bolt"}]']);
    await db.query("select provision_student($1, 'Борис', 'борис', 10)", [bob]);
    const update = await readFile(new URL("../supabase/migrations/202611050001_administrators.sql", import.meta.url), "utf8");
    await db.exec(update);
    await db.query("insert into auth.users(id) values ($1), ($2)", [administrator, secondAdministrator]);
    await db.query("select provision_administrator($1, 'Мария', 'maria', $2)", [administrator, teacher]);
    await db.query("select provision_administrator($1, 'Олег', 'oleg', $2)", [secondAdministrator, teacher]);
    // Re-running the additive update preserves existing students, points, awards and staff.
    await db.exec(update);

    async function asUser(role, id, sql, params = []) {
      await db.exec("begin");
      try {
        await db.exec(`set local role ${role}`);
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id ?? ""]);
        const result = await db.query(sql, params);
        await db.exec("commit");
        return result.rows;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    }

    await assert.rejects(asUser("anon", null, "select * from students"), /permission denied/i);
    assert.deepEqual((await asUser("authenticated", alice, "select name from students")).map((s) => s.name), ["Анна"]);
    assert.deepEqual(await asUser("authenticated", bob, "select * from achievements"), []);
    assert.equal((await asUser("authenticated", alice, "select * from achievements")).length, 1);
    assert.deepEqual(await asUser("authenticated", alice, "select * from teachers"), []);
    assert.deepEqual(await asUser("authenticated", stranger, "select * from students"), []);
    await assert.rejects(asUser("authenticated", alice, "update students set nuts=999"), /permission denied/i);
    await assert.rejects(asUser("authenticated", alice, "insert into teachers values ($1, 'Fake')", [alice]), /permission denied/i);
    await assert.rejects(asUser("authenticated", alice, "select award_nuts($1, 100)", [[alice]]), /Только учитель/);
    await assert.rejects(asUser("authenticated", alice, "select award_achievement($1, 'Fake')", [[alice]]), /Только учитель/);
    await assert.rejects(asUser("authenticated", teacher, "select provision_student($1, 'X', 'x')", [stranger]), /permission denied/i);
    await assert.rejects(asUser("anon", null, "select * from my_student_rank()"), /permission denied/i);
    assert.equal((await asUser("authenticated", teacher, "select * from students")).length, 2);
    assert.equal((await asUser("authenticated", teacher, "select * from admins")).length, 2);
    assert.equal((await asUser("authenticated", administrator, "select * from students")).length, 2);
    assert.deepEqual((await asUser("authenticated", administrator, "select name from admins")).map((a) => a.name), ["Мария"]);
    assert.deepEqual(await asUser("authenticated", administrator, "select * from teachers"), []);
    assert.deepEqual(await asUser("authenticated", alice, "select * from admins"), []);
    assert.deepEqual(await asUser("authenticated", stranger, "select * from admins"), []);
    await assert.rejects(asUser("anon", null, "select * from admins"), /permission denied/i);
    for (const id of [alice, administrator, teacher]) {
      await assert.rejects(asUser("authenticated", id, "insert into admins(user_id,name,login_name) values ($1, 'Fake', 'fake')", [stranger]), /permission denied/i);
      await assert.rejects(asUser("authenticated", id, "select provision_administrator($1, 'Fake', 'fake', $2)", [stranger, teacher]), /permission denied/i);
    }
    await assert.rejects(asUser("authenticated", administrator, "update admins set name='Fake'"), /permission denied/i);
    await assert.rejects(asUser("authenticated", administrator, "delete from admins"), /permission denied/i);
    await assert.rejects(asUser("service_role", null, "select provision_administrator($1, 'Fake', 'fake', $2)", [stranger, administrator]), /Только учитель/);
    await assert.rejects(asUser("service_role", null, "select provision_administrator($1, 'Fake', 'fake', $2)", [alice, teacher]), /другая роль/);
    await assert.rejects(asUser("service_role", null, "select provision_student($1, 'Fake', 'fake')", [teacher]), /аккаунт сотрудника/);
    await assert.rejects(asUser("service_role", null, "select provision_student($1, 'Fake', 'fake')", [administrator]), /аккаунт сотрудника/);
    await asUser("authenticated", administrator, "select award_nuts($1, 4)", [[bob]]);
    assert.equal((await asUser("authenticated", bob, "select nuts from students"))[0].nuts, 14);
    await asUser("authenticated", administrator, "select award_achievement($1, 'Помощь классу')", [[alice]]);
    assert.equal((await asUser("authenticated", alice, "select * from achievements")).length, 2);
    await assert.rejects(asUser("authenticated", alice, "select award_nuts($1, 100)", [[bob]]), /Только учитель/);

    await asUser("authenticated", teacher, "select award_nuts($1, 2)", [[alice]]);
    await asUser("authenticated", teacher, "select award_nuts($1, 3)", [[alice]]);
    assert.equal((await asUser("authenticated", alice, "select nuts from students"))[0].nuts, 10);
    await assert.rejects(asUser("authenticated", teacher, "select award_nuts($1, 100)", [[alice, stranger]]), /Список класса изменился/);
    assert.equal((await asUser("authenticated", alice, "select nuts from students"))[0].nuts, 10);
    await assert.rejects(asUser("authenticated", teacher, "select award_nuts($1, 2147483647)", [[alice]]), /Укажите ненулевое/);
    await asUser("authenticated", teacher, "select award_nuts($1, -100)", [[alice]]);
    assert.equal((await asUser("authenticated", alice, "select nuts from students"))[0].nuts, 0);
    for (let i = 0; i < 2; i++) await asUser("authenticated", teacher, "select award_achievement($1, 'Победа')", [[alice, bob]]);
    assert.equal((await asUser("authenticated", bob, "select * from achievements")).length, 1);
    const rank = (await asUser("authenticated", alice, "select * from my_student_rank()"))[0];
    assert.equal(Number(rank.rank), 2);
    assert.equal(Number(rank.total), 2);
    assert.deepEqual(await asUser("authenticated", stranger, "select * from my_student_rank()"), []);

    // A malformed import rolls back the profile and all achievements together.
    await assert.rejects(db.query("select provision_student($1, 'X', 'x', 0, $2::jsonb)", [stranger, '[{"title":"bad","icon":"invalid"}]']));
    assert.equal((await db.query("select * from students where id=$1", [stranger])).rows.length, 0);
    await db.query("delete from auth.users where id=$1", [alice]);
    assert.equal((await db.query("select * from students where id=$1", [alice])).rows.length, 0);
    assert.equal((await db.query("select * from achievements where student_id=$1", [alice])).rows.length, 0);
    await db.query("delete from auth.users where id=$1", [administrator]);
    assert.equal((await db.query("select * from admins where user_id=$1", [administrator])).rows.length, 0);
  } finally { await db.close(); }
});
