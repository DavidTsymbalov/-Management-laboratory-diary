import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/stats.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const context = {
  exports: {},
  require: () => ({
    rankedStudents: (students) => [...students].sort((a, b) => b.nuts - a.nuts),
  }),
  Intl,
  Date,
  Map,
};
vm.runInNewContext(compiled, context);
const compute = context.exports.computeStats;
test("statistics handle empty/even classes and Moscow calendar dates without inventing historical point balances", () => {
  const now = new Date("2026-11-06T22:00:00Z"); // 7 November in Moscow.
  const empty = compute([], now);
  assert.equal(empty.totalStudents, 0);
  assert.equal(empty.medianNuts, 0);
  assert.equal(empty.achievementCoverage, 0);
  const students = [
    {
      id: "a",
      name: "A",
      nuts: 0,
      createdAt: "2026-11-06T21:15:00Z",
      achievements: [{ earnedAt: "2026-11-06T21:30:00Z" }],
    },
    {
      id: "b",
      name: "B",
      nuts: 10,
      createdAt: "2026-01-01T00:00:00Z",
      achievements: [],
    },
    {
      id: "c",
      name: "C",
      nuts: 30,
      achievements: [{ earnedAt: "2026-11-01T00:00:00Z" }],
    },
    {
      id: "d",
      name: "D",
      nuts: 100,
      achievements: [{ earnedAt: "2026-12-01T00:00:00Z" }],
    },
  ];
  const result = compute(students, now);
  assert.equal(result.totalNuts, 140);
  assert.equal(result.averageNuts, 35);
  assert.equal(result.medianNuts, 20);
  assert.equal(result.withPoints, 3);
  assert.equal(result.withAchievements, 3);
  assert.equal(result.achievementCoverage, 75);
  assert.equal(result.newThisWeek, 1);
  assert.equal(result.awardsThisWeek, 2);
  assert.equal(result.weeklyAwards.at(-1).day, "2026-11-07");
  assert.equal(result.weeklyAwards.at(-1).count, 1);
  assert.equal(
    result.distribution.reduce((sum, band) => sum + band.count, 0),
    4,
  );
});
