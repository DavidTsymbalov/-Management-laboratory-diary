import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setup, teacher, alice, bob, outsider } from "./messenger-db.mjs";
export { teacher, alice, bob, outsider };
export const csa = "30000000-0000-4000-8000-000000000001";
export async function securitySetup() {
  const context = await setup();
  await context.migrate();
  await context.db
    .exec(`alter table auth.users add column email text; alter table auth.users add column encrypted_password text;
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),aal text default 'aal1',user_agent text,ip text);
 create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,status text,factor_type text);`);
  for (const file of [
    "202611070001_attendance.sql",
    "202611070002_security_csa.sql",
  ])
    await context.db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  await context.db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611070002_security_csa.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await context.db.query("insert into auth.users values($1)", [csa]);
  await context.db.query("insert into csa_accounts values($1,'CSA')", [csa]);
  const sessions = new Map();
  for (const id of [teacher, alice, bob, outsider, csa]) {
    const sid = randomUUID();
    sessions.set(id, sid);
    await context.db.query(
      "insert into auth.sessions(id,user_id,aal,user_agent,ip) values($1,$2,$3,'Test browser','127.0.0.1')",
      [sid, id, id === csa ? "aal2" : "aal1"],
    );
  }
  async function as(id, sql, args = [], options = {}) {
    const role = options.role ?? "authenticated",
      sid = options.sid ?? sessions.get(id),
      aal = options.aal ?? (id === csa ? "aal2" : "aal1");
    await context.db.exec("begin");
    try {
      await context.db.exec(`set local role ${role}`);
      await context.db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [id ?? "", JSON.stringify({ sub: id, session_id: sid, aal })],
      );
      const result = await context.db.query(sql, args);
      await context.db.exec("commit");
      return result.rows;
    } catch (error) {
      await context.db.exec("rollback");
      throw error;
    }
  }
  return { ...context, as, sessions };
}
