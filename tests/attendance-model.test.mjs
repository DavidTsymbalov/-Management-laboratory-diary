import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const context = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../src/lib/attendance.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  context,
);
const {
  monthThursdays,
  shiftAttendanceMonth,
  moscowDate,
  suggestedLessonDate,
  attendanceSummary,
} = context.exports;
test("register dates use Moscow calendar days and real Thursdays across months and leap years", () => {
  assert.equal(moscowDate(new Date("2026-11-11T22:30:00Z")), "2026-11-12");
  assert.deepEqual(Array.from(monthThursdays("2026-11")), [
    "2026-11-05",
    "2026-11-12",
    "2026-11-19",
    "2026-11-26",
  ]);
  assert.deepEqual(Array.from(monthThursdays("2024-02")), [
    "2024-02-01",
    "2024-02-08",
    "2024-02-15",
    "2024-02-22",
    "2024-02-29",
  ]);
  assert.equal(shiftAttendanceMonth("2026-12", 1), "2027-01");
  assert.equal(shiftAttendanceMonth("2026-01", -1), "2025-12");
  assert.equal(suggestedLessonDate("2026-11", "2026-11-07"), "2026-11-12");
  assert.equal(suggestedLessonDate("2026-11", "2026-11-12"), "2026-11-12");
});
test("attendance percentage excludes cancelled lessons and unmarked records without treating emptiness as absence", () => {
  const lessons = [
    { id: "held", cancelled: false },
    { id: "cancelled", cancelled: true },
  ];
  const records = ["present", "late", "absent", "excused", null].map(
    (status) => ({ lesson_id: "held", status }),
  );
  records.push({ lesson_id: "cancelled", status: "absent" });
  const summary = attendanceSummary(lessons, records);
  assert.equal(summary.attended, 2);
  assert.equal(summary.marked, 4);
  assert.equal(summary.percent, 50);
  assert.equal(summary.unmarked, 1);
  assert.equal(summary.absent, 1);
  assert.equal(
    attendanceSummary(lessons, [{ lesson_id: "held", status: null }]).percent,
    null,
  );
  assert.equal(
    attendanceSummary([{ id: "held", cancelled: true }], records).marked,
    0,
  );
});
