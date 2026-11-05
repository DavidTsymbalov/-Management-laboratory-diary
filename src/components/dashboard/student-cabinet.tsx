"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Asterisk, Award, LogOut, Plus, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AchievementIcon } from "@/data/seed";
import type { AppData } from "@/lib/store";
import {
  getCloudRank,
  getCloudRole,
  loadCloudData,
  signOutCloud,
  watchCloudData,
} from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";

const achievementIcons: Record<AchievementIcon, typeof Plus> = {
  plus: Plus,
  bolt: Zap,
  cross: Asterisk,
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата не указана";
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function StudentCabinet() {
  const router = useRouter();
  const [data, setData] = useState<AppData | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [standing, setStanding] = useState<{ rank: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rankError, setRankError] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function refresh() {
      if (!active || inFlight) return;
      inFlight = true;
      setRefreshing(true);

      try {
        const role = await getCloudRole();
        if (!active) return;
        if (role?.role !== "student") {
          router.replace("/student/");
          return;
        }

        // A rank outage must not hide the student's own balance and achievements.
        const [loaded, rank] = await Promise.allSettled([
          loadCloudData(),
          getCloudRank(),
        ]);
        if (!active) return;
        if (loaded.status === "rejected") throw loaded.reason;
        if (!loaded.value.students.some((student) => student.id === role.id)) {
          throw new Error("Не удалось найти твой дневник. Обратись к преподавателю.");
        }

        setData(loaded.value);
        setStudentId(role.id);
        setError(null);
        setStanding(rank.status === "fulfilled" ? rank.value : null);
        setRankError(rank.status === "rejected");
      } catch (error) {
        if (active) setError(cloudError(error));
      } finally {
        inFlight = false;
        if (active) setRefreshing(false);
      }
    }

    refreshRef.current = refresh;
    void refresh();
    const stop = watchCloudData(refresh);
    return () => {
      active = false;
      stop();
    };
  }, [router]);

  const me = useMemo(
    () => data?.students.find((student) => student.id === studentId) ?? null,
    [data, studentId],
  );

  const achievements = useMemo(
    () => [...(me?.achievements ?? [])].sort(
      (a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime(),
    ),
    [me],
  );

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError(null);
    try {
      await signOutCloud();
      router.replace("/student/");
    } catch (error) {
      setLogoutError(cloudError(error));
      setSigningOut(false);
    }
  }

  if (!data || !me) {
    if (error) {
      return (
        <section className="student-error" aria-labelledby="student-error-heading">
          <p className="eyebrow">Кабинет ученика</p>
          <h1 id="student-error-heading">Дневник пока недоступен</h1>
          <p role="alert">{error}</p>
          <div className="student-error-actions">
            <Button onClick={() => void refreshRef.current()} disabled={refreshing}>
              <RefreshCw size={16} aria-hidden="true" />
              {refreshing ? "Загружаем…" : "Попробовать ещё раз"}
            </Button>
            <Button href="/student/" variant="ghost">Ко входу</Button>
          </div>
        </section>
      );
    }

    return (
      <div className="student-loading workspace-loading" role="status">
        <span className="loading-dot" aria-hidden="true" />
        <h1>Открываем твой дневник</h1>
        <p>Загружаем баллы и достижения…</p>
      </div>
    );
  }

  return (
    <div className="student-workspace">
      <header className="student-heading page-heading">
        <div className="student-heading-copy">
          <p className="eyebrow">Кабинет ученика</p>
          <h1>{me.name}</h1>
          <p className="page-description">Твои баллы и достижения в одном месте.</p>
        </div>
        <button
          type="button"
          className="action secondary"
          onClick={() => void handleLogout()}
          disabled={signingOut}
        >
          <LogOut size={16} aria-hidden="true" />
          {signingOut ? "Выходим…" : "Выйти"}
        </button>
      </header>

      {error && (
        <p role="alert" className="notice danger">
          Не удалось обновить дневник. {error} Показаны последние загруженные данные.
        </p>
      )}
      {logoutError && <p role="alert" className="notice danger">Не удалось выйти. {logoutError}</p>}

      <dl className="student-summary" aria-label="Твои результаты">
        <div className="student-summary-item student-balance">
          <dt className="student-metric-label">Текущий баланс</dt>
          <dd className="student-metric-value">
            {me.nuts.toLocaleString("ru-RU")} <span>баллов</span>
          </dd>
          <dd className="student-metric-note">За работу на занятиях и результаты.</dd>
        </div>
        <div className="student-summary-item">
          <dt className="student-metric-label">Место в классе</dt>
          <dd className="student-metric-value">
            {standing ? <>{standing.rank}<span> из {standing.total}</span></> : "—"}
          </dd>
          <dd className="student-metric-note">
            {rankError ? "Рейтинг временно недоступен. Попробуй обновить дневник." : "По баллам; при равенстве — по имени."}
          </dd>
        </div>
        <div className="student-summary-item">
          <dt className="student-metric-label">Достижения</dt>
          <dd className="student-metric-value">{achievements.length.toLocaleString("ru-RU")}</dd>
          <dd className="student-metric-note">
            {achievements.length
              ? <>Последнее — {formatDate(achievements[0].earnedAt)}</>
              : "Здесь будут отмечены твои успехи."}
          </dd>
        </div>
      </dl>

      <section className="student-achievements" aria-labelledby="student-achievements-heading">
        <div className="student-section-heading section-heading">
          <h2 id="student-achievements-heading">
            Достижения <span className="achievement-count">{achievements.length}</span>
          </h2>
          {achievements.length > 0 && <p>Сначала новые</p>}
        </div>

        {achievements.length === 0 ? (
          <div className="student-empty">
            <span className="student-empty-symbol"><Award size={26} strokeWidth={1.4} aria-hidden="true" /></span>
            <div>
              <h3>Пока нет достижений</h3>
              <p>Когда преподаватель или администратор выдаст тебе достижение, оно появится здесь вместе с датой.</p>
            </div>
          </div>
        ) : (
          <ol className="achievement-ledger">
            {achievements.map((achievement) => {
              const Icon = achievementIcons[achievement.icon ?? "plus"];
              return (
                <li key={achievement.id} className="achievement-entry">
                  <span className="achievement-symbol"><Icon size={22} strokeWidth={1.6} aria-hidden="true" /></span>
                  <div className="achievement-entry-copy">
                    <h3>{achievement.title}</h3>
                  </div>
                  <div className="achievement-entry-meta">
                    <time dateTime={achievement.earnedAt}>{formatDate(achievement.earnedAt)}</time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="student-sync">
        <p className={`student-sync-status${error || rankError ? " is-stale" : ""}`}>
          <span className="status-dot" aria-hidden="true" />
          {error ? "Не удалось обновить" : (
            <>Обновлено в <time dateTime={data.updatedAt}>{new Date(data.updatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</time></>
          )}
          <span className="student-sync-note">Данные обновляются автоматически</span>
        </p>
        <button
          type="button"
          className="quiet-action student-refresh"
          onClick={() => void refreshRef.current()}
          disabled={refreshing || signingOut}
          aria-label={refreshing ? "Обновляем дневник" : "Обновить дневник"}
        >
          <RefreshCw size={15} className={refreshing ? "is-spinning" : undefined} aria-hidden="true" />
          {refreshing ? "Обновляем…" : "Обновить"}
        </button>
      </div>
    </div>
  );
}
