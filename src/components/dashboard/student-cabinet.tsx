"use client";
import {
  addTransitionType,
  startTransition,
  ViewTransition,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Award,
  BookOpen,
  MessageCircle,
  Presentation,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { AchievementBadge } from "@/components/ui/achievement-badge";
import { LessonBoard } from "@/components/dashboard/lesson-board";
import { HomeworkBoard } from "@/components/dashboard/homework-board";
import { StudentRemarks } from "@/components/dashboard/student-remarks";
import { StudentChats } from "@/components/social/student-chats";
import type { AppData } from "@/lib/store";
import {
  getCloudRank,
  getCloudRole,
  loadCloudData,
  watchCloudData,
} from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";
const earnedDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
export function StudentCabinet() {
  const router = useRouter();
  const [data, setData] = useState<AppData | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [standing, setStanding] = useState<{
    rank: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rankError, setRankError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<"diary" | "lessons" | "chats">("diary");
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const role = await getCloudRole();
        if (!active) return;
        if (role?.requiresMfa) {
          router.replace(`/${role.role}/`);
          return;
        }
        if (role?.role !== "student" && role?.role !== "admin") {
          router.replace("/student/");
          return;
        }
        const [loaded, rank] = await Promise.allSettled([
          loadCloudData(),
          getCloudRank(),
        ]);
        if (!active) return;
        if (loaded.status === "rejected") throw loaded.reason;
        setData(loaded.value);
        setStudentId(role.id);
        setAdmin(role.role === "admin");
        setError(null);
        setStanding(rank.status === "fulfilled" ? rank.value : null);
        setRankError(rank.status === "rejected");
      } catch (reason) {
        if (active) {
          setData(null);
          setStudentId(null);
          setError(cloudError(reason));
        }
      }
    }
    void refresh();
    const stop = watchCloudData(refresh);
    return () => {
      active = false;
      stop();
    };
  }, [router, attempt]);
  const me = useMemo(
    () => data?.students.find((student) => student.id === studentId) ?? null,
    [data, studentId],
  );
  function choose(next: "diary" | "lessons" | "chats") {
    startTransition(() => {
      addTransitionType("student-tab");
      setTab(next);
    });
  }
  if (!me || !studentId)
    return (
      <section className="student-journal student-journal-loading">
        <h1>{error ? "Дневник пока недоступен" : "Загружаем дневник…"}</h1>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button
              type="button"
              className="teacher-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Попробовать ещё раз
            </button>
          </>
        )}
      </section>
    );
  return (
    <div className="student-journal">
      <StudentRemarks key={studentId} studentId={studentId} />
      <header className="student-journal-heading">
        <div>
          <p>Мой дневник</p>
          <h1>{me.name}</h1>
        </div>
        {admin && (
          <Link href="/admin/dashboard/" className="teacher-button">
            Управление классом
          </Link>
        )}
      </header>
      <nav className="student-journal-tabs" aria-label="Разделы дневника">
        <button
          type="button"
          aria-current={tab === "diary" ? "page" : undefined}
          onClick={() => choose("diary")}
        >
          <BookOpen size={18} aria-hidden="true" />
          Дневник
        </button>
        <button
          type="button"
          aria-current={tab === "lessons" ? "page" : undefined}
          onClick={() => choose("lessons")}
        >
          <Presentation size={18} aria-hidden="true" />
          Занятия
        </button>
        <button
          type="button"
          aria-current={tab === "chats" ? "page" : undefined}
          onClick={() => choose("chats")}
        >
          <MessageCircle size={18} aria-hidden="true" />
          Чаты
          {unread > 0 && (
            <span
              className="chat-unread"
              aria-label={`${unread} непрочитанных`}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </nav>
      {error && (
        <div className="student-update-error" role="status">
          <p>Не удалось обновить дневник. {error}</p>
          <button
            type="button"
            className="teacher-button subtle"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Повторить
          </button>
        </div>
      )}
      <ViewTransition
        default="none"
        update={{ "student-tab": "workspace-tab-change", default: "none" }}
      >
        <div className="student-tab-content">
          <section
            className="student-diary-content"
            hidden={tab !== "diary"}
            aria-label="Мои результаты"
          >
            <HomeworkBoard />
            <dl className="pupil-results">
              <div className="pupil-balance">
                <dt>Мои баллы</dt>
                <dd>{me.nuts.toLocaleString("ru-RU")}</dd>
              </div>
              <div>
                <dt>
                  <TrendingUp size={17} aria-hidden="true" />
                  Место в классе
                </dt>
                <dd>
                  {standing?.rank ?? "—"}
                  {standing && <span>из {standing.total}</span>}
                </dd>
                {rankError && <p>Рейтинг пока недоступен</p>}
              </div>
              <div>
                <dt>
                  <Award size={17} aria-hidden="true" />
                  Награды
                </dt>
                <dd>{me.achievements.length}</dd>
              </div>
            </dl>
            <section
              className="pupil-awards"
              aria-labelledby="pupil-awards-heading"
            >
              <div className="pupil-section-heading">
                <h2 id="pupil-awards-heading">Мои награды</h2>
                <span>{me.achievements.length}</span>
              </div>
              {me.achievements.length ? (
                <ol>
                  {me.achievements.map((award) => (
                    <li key={award.id}>
                      <AchievementBadge icon={award.icon} title={award.title} />
                      <time dateTime={award.earnedAt}>
                        {earnedDate.format(new Date(award.earnedAt))}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="pupil-empty-awards">
                  <Award size={28} aria-hidden="true" />
                  <p>Пока нет наград</p>
                </div>
              )}
            </section>
          </section>
          {tab === "lessons" && <LessonBoard />}
          <StudentChats
            key={studentId}
            studentId={studentId}
            active={tab === "chats"}
            onOpen={() => choose("chats")}
            onUnread={setUnread}
          />
        </div>
      </ViewTransition>
    </div>
  );
}
