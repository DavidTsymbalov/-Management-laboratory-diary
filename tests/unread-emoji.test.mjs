import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { setup, alice, bob, outsider } from "./helpers/messenger-db.mjs";
function sourceModule(path, dependencies = {}) {
  const context = {
    exports: {},
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
      return dependencies[name];
    },
  };
  vm.runInNewContext(
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return context.exports;
}
// Run the production Supabase query chain against real Postgres with Bob's RLS.
function queryClient(as) {
  return {
    from(table) {
      assert.ok(
        ["student_emoji_reads", "student_emoji_messages"].includes(table),
      );
      let fields = "*",
        order = "",
        limit = "";
      const where = [],
        args = [];
      const compare = (key, operator, value) => {
        args.push(value);
        where.push(`${key} ${operator} $${args.length}`);
        return chain;
      };
      const chain = {
        select(value) {
          fields = value;
          return chain;
        },
        eq(key, value) {
          return compare(key, "=", value);
        },
        gt(key, value) {
          return compare(key, ">", value);
        },
        lte(key, value) {
          return compare(key, "<=", value);
        },
        not(key, operator, value) {
          assert.equal(operator, "is");
          assert.equal(value, null);
          where.push(`${key} is not null`);
          return chain;
        },
        order(key, { ascending }) {
          order = `order by ${key} ${ascending ? "asc" : "desc"}`;
          return chain;
        },
        limit(value) {
          limit = `limit ${Number(value)}`;
          return chain;
        },
        async maybeSingle() {
          try {
            const rows = await as(
              bob,
              `select ${fields} from ${table} where ${where.join(" and ")} ${order} ${limit}`,
              args,
            );
            assert.ok(rows.length <= 1);
            return { data: rows[0] ?? null, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
      };
      return chain;
    },
  };
}
test("opening finds an unread emoji beyond forty newer texts, ignores own/future/other-peer messages, and respects the server read cursor", async () => {
  const { db, as, migrate } = await setup();
  try {
    await migrate();
    await db.query("select provision_student($1,'Другой','Другой')", [
      outsider,
    ]);
    async function insert(from, to, emoji, body = null) {
      return (
        await db.query(
          "insert into student_emoji_messages(sender_id,recipient_id,emoji,body,client_nonce) values($1,$2,$3,$4,$5) returning id",
          [from, to, emoji, body, randomUUID()],
        )
      ).rows[0].id;
    }
    const read = await insert(alice, bob, "❤️");
    const unread = await insert(alice, bob, "💩");
    for (let index = 0; index < 45; index++)
      await insert(alice, bob, null, `Текст ${index}`);
    const visibleThrough = await insert(bob, alice, "🔥");
    const future = await insert(alice, bob, "👏");
    await insert(outsider, bob, "⚡");
    await as(bob, "select mark_student_emoji_read($1,$2)", [alice, read]);
    const reactions = sourceModule("../src/lib/emoji-reactions.ts");
    const client = queryClient(as);
    const { loadUnreadReaction } = sourceModule("../src/lib/emoji-chat.ts", {
      "@/lib/supabase": { getSupabase: () => client },
      "@/lib/emoji-reactions": reactions,
    });
    let reaction = await loadUnreadReaction(alice, bob, Number(visibleThrough));
    assert.equal(reaction.id, Number(unread));
    assert.equal(reaction.emoji, "💩");
    await as(bob, "select mark_student_emoji_read($1,$2)", [
      alice,
      visibleThrough,
    ]);
    assert.equal(
      await loadUnreadReaction(alice, bob, Number(visibleThrough)),
      null,
    );
    reaction = await loadUnreadReaction(alice, bob, Number(future));
    assert.equal(reaction.id, Number(future));
    await as(bob, "select mark_student_emoji_read($1,$2)", [alice, future]);
    assert.equal(await loadUnreadReaction(alice, bob, Number(future)), null);
    assert.equal(
      await loadUnreadReaction(alice, outsider, Number(future)),
      null,
      "Bob cannot query Alice's conversation with another pupil",
    );
  } finally {
    await db.close();
  }
});
