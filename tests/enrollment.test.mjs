import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { securitySetup, teacher, alice, bob, csa } from "./helpers/security-db.mjs";

test("public enrollment saves validated contacts without disclosing or overwriting them; reading requires a live teacher/CSA session", async () => {
  const { db, as, sessions } = await securitySetup();
  try {
    const migration = await readFile(new URL("../supabase/migrations/202611080001_enrollment_form.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const submit = "select submit_enrollment_request($1,$2,$3,$4)";
    const anonymous = (args) => as(null, submit, args, { role: "anon" });
    await anonymous(["  Анна  Мария ", "Иванова", "https://t.me/Anna_123", ""]);
    await anonymous(["Чужое имя", "Чужая фамилия", "@ANNA_123", ""]);
    let entries = (await as(teacher, "select list_enrollment_requests() result"))[0].result;
    assert.equal(entries.total, 1);
    assert.equal(entries.items[0].first_name, "Анна Мария");
    assert.equal(entries.items[0].telegram, "anna_123");
    assert.ok(entries.items[0].created_at);
    await anonymous(["Бот", "Тестовый", "spam_user", "https://bot.example"]);
    for (const args of [["", "Иванов", "valid_user", ""], ["123", "Иванов", "valid_user", ""], ["Анна", "<script>", "valid_user", ""], ["А".repeat(81), "Иванов", "valid_user", ""], ["Анна", "Иванова", "@a", ""], ["Анна", "Иванова", "user');drop table students;--", ""], [null, "Иванова", "valid_user", ""]])
      await assert.rejects(anonymous(args));
    await as(alice, submit, ["Борис", "Петров", "@boris_user", ""]);
    await assert.rejects(as(null, "select * from enrollment_requests", [], { role: "anon" }), /permission denied/i);
    await assert.rejects(as(null, "select list_enrollment_requests()", [], { role: "anon" }), /permission denied/i);
    await db.query("insert into student_administrators(student_id) values($1)", [bob]);
    for (const id of [alice, bob]) {
      assert.deepEqual(await as(id, "select * from enrollment_requests"), []);
      await assert.rejects(as(id, "select list_enrollment_requests()"), /только преподавателю/i);
      await assert.rejects(as(id, "insert into enrollment_requests(first_name,last_name,telegram) values('Fake','Fake','fake_user')"), /permission denied/i);
      await assert.rejects(as(id, "update enrollment_requests set first_name='Fake'"), /permission denied/i);
      await assert.rejects(as(id, "delete from enrollment_requests"), /permission denied/i);
    }
    entries = (await as(csa, "select list_enrollment_requests('ИВАНОВА',0) result"))[0].result;
    assert.equal(entries.total, 1);
    assert.equal(entries.items[0].first_name, "Анна Мария");
    assert.equal((await as(teacher, "select * from enrollment_requests")).length, 2);
    assert.equal((await as(csa, "select list_enrollment_requests('',100) result"))[0].result.items.length, 0);
    assert.equal((await as(csa, "select list_enrollment_requests('%',0) result"))[0].result.total, 0, "search treats percent as text");
    await assert.rejects(as(teacher, "select list_enrollment_requests('',-1)"));
    await db.query("insert into security_session_blocks(session_id,user_id) values($1,$2)", [sessions.get(teacher), teacher]);
    assert.deepEqual(await as(teacher, "select * from enrollment_requests"), []);
    await assert.rejects(as(teacher, "select list_enrollment_requests()"), /только преподавателю/i);
    assert.equal((await as(csa, "select list_enrollment_requests() result"))[0].result.total, 2);
  } finally {
    await db.close();
  }
});
