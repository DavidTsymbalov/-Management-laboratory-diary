import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export const teacher = "20000000-0000-4000-8000-000000000001";
export const alice = "20000000-0000-4000-8000-000000000002";
export const bob = "20000000-0000-4000-8000-000000000003";
export const outsider = "20000000-0000-4000-8000-000000000004";
export async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for (const file of [
    "202611030001_classroom.sql",
    "202611060001_student_administrators.sql",
    "202611060002_emoji_chats.sql",
  ])
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  for (const id of [teacher, alice, bob, outsider])
    await db.query("insert into auth.users values($1)", [id]);
  await db.query("insert into teachers values($1,'Учитель')", [teacher]);
  for (const [id, name] of [
    [alice, "Анна"],
    [bob, "Борис"],
  ])
    await db.query("select provision_student($1,$2,$2)", [id, name]);
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202611060003_homework_messages.sql",
      import.meta.url,
    ),
    "utf8",
  );
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
  return { db, as, migrate: () => db.exec(migration) };
}
