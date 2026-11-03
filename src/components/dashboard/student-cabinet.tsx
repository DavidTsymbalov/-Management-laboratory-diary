"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NutsBadge } from "@/components/ui/nuts-badge";
import { AchievementBadge } from "@/components/ui/achievement-badge";
import {
  getStudentRank,
  loadData,
  type AppData,
} from "@/lib/store";
import {
  getStudentSessionId,
  setStudentSessionId,
} from "@/lib/session";
import { pixelNavigate } from "@/lib/pixel-nav";

export function StudentCabinet() {
  const router = useRouter();
  const [data, setData] = useState<AppData | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const id = getStudentSessionId();
      if (!id) {
        router.replace("/student/");
        return;
      }
      const loaded = loadData();
      if (!loaded.students.some((s) => s.id === id)) {
        setStudentSessionId(null);
        router.replace("/student/");
        return;
      }
      setData(loaded);
      setStudentId(id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

  const me = useMemo(
    () => data?.students.find((s) => s.id === studentId) ?? null,
    [data, studentId],
  );

  const rank = useMemo(() => {
    if (!data || !studentId) return null;
    return getStudentRank(data.students, studentId);
  }, [data, studentId]);

  if (!data || !me) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Личный кабинет
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {me.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ваши баллы и ачивки.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => pixelNavigate("/")}
          >
            На главную
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setStudentSessionId(null);
              pixelNavigate("/student/");
            }}
          >
            Выйти
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col items-center justify-center gap-3 py-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Мои баллы
          </p>
          <NutsBadge value={me.nuts} size="lg" />
        </Card>
        <Card className="flex flex-col justify-center py-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Место в классе
          </p>
          <p className="mt-3 font-display text-5xl font-bold tabular-nums tracking-tight text-[#e5dac3]">
            №{rank ?? "—"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            из {data.students.length}
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-5 font-display text-xl font-semibold tracking-tight">
          Мои ачивки
        </h2>
        {me.achievements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока пусто — учитель выдаст ачивку за задание.
          </p>
        ) : (
          <ul className="space-y-4">
            {me.achievements.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 border-b border-border/60 pb-4 last:border-0 last:pb-0"
              >
                <AchievementBadge icon={item.icon} title={item.title} />
                <p className="shrink-0 text-xs text-muted-foreground">
                  {new Date(item.earnedAt).toLocaleString("ru-RU")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
