"use client";

import { useMemo } from "react";
import type { Student } from "@/data/seed";
import { rankedStudents } from "@/lib/store";
import { Card } from "@/components/ui/card";

export function TeacherCharts({ students }: { students: Student[] }) {
  const ranked = useMemo(() => rankedStudents(students), [students]);
  const maxNuts = Math.max(1, ...ranked.map((s) => s.nuts));
  const totalAch = students.reduce((sum, s) => sum + s.achievements.length, 0);
  const withAch = students.filter((s) => s.achievements.length > 0).length;
  const withoutAch = Math.max(0, students.length - withAch);

  if (students.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          Графики появятся, когда добавите учеников и баллы.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-5">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Рейтинг
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold tracking-tight">
            Баллы по ученикам
          </h3>
        </div>
        <div className="space-y-4">
          {ranked.map((student) => {
            const width = Math.max(4, Math.round((student.nuts / maxNuts) * 100));
            return (
              <div key={student.id} className="space-y-1.5">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{student.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {student.nuts}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${width}%`,
                      background: "var(--nut)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-5">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Охват
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold tracking-tight">
            Ачивки в классе
          </h3>
        </div>
        <div className="flex items-end justify-center gap-4 pt-2 sm:gap-8">
          <Bar
            label="С ачивками"
            value={withAch}
            max={Math.max(1, students.length)}
            fill="var(--accent)"
          />
          <Bar
            label="Без ачивок"
            value={withoutAch}
            max={Math.max(1, students.length)}
            fill="var(--surface)"
          />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Всего ачивок выдано:{" "}
          <span className="font-semibold text-foreground">{totalAch}</span>
        </p>

        <svg viewBox="0 0 120 120" className="mx-auto h-36 w-36" aria-hidden>
          <circle
            cx="60"
            cy="60"
            r="40"
            fill="transparent"
            stroke="var(--surface)"
            strokeWidth="12"
          />
          {students.length > 0 ? (
            <circle
              cx="60"
              cy="60"
              r="40"
              fill="transparent"
              stroke="var(--nut)"
              strokeWidth="12"
              strokeDasharray={`${(withAch / students.length) * 251} 251`}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
            />
          ) : null}
          <text
            x="60"
            y="64"
            textAnchor="middle"
            fill="var(--foreground)"
            fontSize="16"
            fontWeight="700"
          >
            {students.length === 0
              ? "0%"
              : `${Math.round((withAch / students.length) * 100)}%`}
          </text>
        </svg>
      </Card>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  fill,
}: {
  label: string;
  value: number;
  max: number;
  fill: string;
}) {
  const height = Math.max(8, Math.round((value / max) * 140));
  return (
    <div className="flex w-24 flex-col items-center gap-2">
      <div className="flex h-36 w-10 items-end rounded-xl bg-surface/80 p-1">
        <div
          className="w-full rounded-lg transition-all duration-500"
          style={{ height, background: fill }}
        />
      </div>
      <p className="text-center text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <p className="tabular-nums text-sm font-semibold">{value}</p>
    </div>
  );
}
