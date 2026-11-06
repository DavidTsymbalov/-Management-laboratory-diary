"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NutsBadge } from "@/components/ui/nuts-badge";
import { AchievementBadge } from "@/components/ui/achievement-badge";
import {
  getStudentRank,
  type AppData,
} from "@/lib/store";
import { getCloudRank, getCloudRole, loadCloudData, signOutCloud, watchCloudData } from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";
import { pixelNavigate } from "@/lib/pixel-nav";

export function StudentCabinet() {
  const router = useRouter();
  const [data, setData] = useState<AppData | null>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [standing, setStanding] = useState<{ rank: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const role = await getCloudRole();
        if (!active) return;
        if (role?.role !== "student" && role?.role !== "admin") { router.replace("/student/"); return; }
        const [loaded, rank] = await Promise.all([loadCloudData(), getCloudRank()]);
        if (active) {
          setData(loaded); setHasAdminAccess(role.role==="admin"); setStudentId(role.id); setStanding(rank); setError(null);
        }
      } catch (error) { if (active) setError(cloudError(error)); }
    }
    void refresh();
    const stop = watchCloudData(refresh);
    return () => { active = false; stop(); };
  }, [router]);

  const me = useMemo(
    () => data?.students.find((s) => s.id === studentId) ?? null,
    [data, studentId],
  );

  const rank = useMemo(() => {
    if (!data || !studentId) return null;
    return standing?.rank ?? getStudentRank(data.students, studentId);
  }, [data, studentId, standing]);

  if (!data || !me) {
    if (error) return <div role="alert" className="space-y-3"><p>{error}</p><Button onClick={() => window.location.reload()}>Повторить</Button><Button href="/student/">Ко входу</Button></div>;
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {error ? <p role="alert" className="text-sm text-danger">{error} Показаны последние загруженные данные.</p> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Личный кабинет
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-4xl">
            {me.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ваши баллы и ачивки.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasAdminAccess && <Button href="/admin/dashboard/" variant="secondary" size="sm">Управление классом</Button>}
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
            onClick={async () => {
              try { await signOutCloud(); pixelNavigate("/student/"); }
              catch (error) { setError(cloudError(error)); }
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
          <p className="mt-3 font-display text-5xl font-bold tabular-nums tracking-tight text-foreground">
            №{rank ?? "—"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            из {standing?.total ?? data.students.length}
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
                className="flex flex-col items-start justify-between gap-2 border-b border-border/60 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
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
