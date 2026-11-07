"use client";

import {
  startTransition,
  ViewTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Award,
  BarChart3,
  Check,
  ClipboardList,
  CalendarCheck,
  BookOpen,
  Copy,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { AppData } from "@/lib/store";
import { rankedStudents } from "@/lib/store";
import { computeStats } from "@/lib/stats";
import {
  addCloudStudents,
  awardCloudAchievement,
  awardCloudNuts,
  configureStudentAdministrator,
  getCloudRole,
  loadCloudData,
  loadStaffExtras,
  manageCloudStudents,
  signOutCloud,
  watchCloudData,
  type AdministratorLimits,
  type CloudRole,
  type StaffExtras,
  type StudentInput,
} from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { TeacherCharts } from "@/components/dashboard/teacher-charts";
import { AdministratorSettings } from "@/components/dashboard/administrator-settings";
import { HomeworkBoard } from "@/components/dashboard/homework-board";
import { AttendanceRegister } from "@/components/dashboard/attendance-register";
import { ActivityList } from "@/components/dashboard/activity-list";
import { StudentAccess } from "@/components/dashboard/student-access";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
import Link from "next/link";

type Tab =
  | "attendance"
  | "homework"
  | "overview"
  | "students"
  | "awards"
  | "administrators"
  | "activity";
const destinations = [
  { id: "overview", label: "Обзор", icon: BarChart3 },
  { id: "attendance", label: "Классный журнал", icon: CalendarCheck },
  { id: "homework", label: "Домашние задания", icon: BookOpen },
  { id: "students", label: "Ученики", icon: Users },
  { id: "awards", label: "Награды", icon: Award },
  { id: "administrators", label: "Администраторы", icon: ShieldCheck },
  { id: "activity", label: "История действий", icon: ClipboardList },
] as const;
const emptyExtras: StaffExtras = {
  available: false,
  administrators: [],
  activity: [],
  quota: null,
  moreActivity: false,
};
const number = (value: number) => value.toLocaleString("ru-RU");
const limitLabels = {
  capacity: "Участников в классе",
  deleted: "Удалений сегодня",
  points: "Баллов сегодня",
  awards: "Наград сегодня",
} as const;
function randomPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function limitsFor(
  assigned: StaffExtras["administrators"][number],
): AdministratorLimits {
  return {
    capacity: assigned.capacity_limit,
    deleted: assigned.deleted_limit,
    points: assigned.points_limit,
    awards: assigned.awards_limit,
  };
}

export function TeacherPanel({
  role = "teacher",
}: {
  role?: "teacher" | "admin";
}) {
  const router = useRouter();
  const [actor, setActor] = useState<CloudRole | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [extras, setExtras] = useState<StaffExtras>(emptyExtras);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [showAdd, setShowAdd] = useState(false);
  const [namesText, setNamesText] = useState("");
  const [credentials, setCredentials] = useState<StudentInput[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState("5");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [adminEditor, setAdminEditor] = useState<string | null>(null);
  const locked = useRef(false);
  const addField = useRef<HTMLTextAreaElement>(null);
  const teacher = role === "teacher";

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (locked.current) return;
      try {
        const current = await getCloudRole();
        if (!active) return;
        if (current?.role !== role) {
          router.replace(`/${role}/`);
          return;
        }
        const [loaded, staff] = await Promise.all([
          loadCloudData(),
          loadStaffExtras(role),
        ]);
        if (active && !locked.current) {
          setActor(current);
          setData(loaded);
          setExtras(staff);
          setLoadError(null);
        }
      } catch (error) {
        if (active) {
          setLoadError(cloudError(error));
        }
      }
    }
    void refresh();
    const stop = watchCloudData(refresh);
    return () => {
      active = false;
      stop();
    };
  }, [router, role, attempt]);
  useEffect(() => {
    if (showAdd) addField.current?.focus();
  }, [showAdd]);

  const stats = useMemo(() => computeStats(data?.students ?? []), [data]);
  const ranked = useMemo(() => rankedStudents(data?.students ?? []), [data]);
  const adminIds = useMemo(
    () => new Set(extras.administrators.map((a) => a.student_id)),
    [extras.administrators],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    const rows = (data?.students ?? []).filter((student) =>
      student.name.toLocaleLowerCase("ru-RU").includes(needle),
    );
    return rows.sort((a, b) =>
      sort === "points"
        ? b.nuts - a.nuts || a.name.localeCompare(b.name, "ru")
        : a.name.localeCompare(b.name, "ru"),
    );
  }, [data, query, sort]);
  const eligible = visible.filter(
    (student) =>
      teacher || (!adminIds.has(student.id) && student.id !== actor?.id),
  );
  const safeSelected = selected.filter(
    (id) =>
      data?.students.some((student) => student.id === id) &&
      (teacher || !adminIds.has(id)),
  );
  function fail(message: string) {
    setFeedback({ type: "error", message });
  }
  function choose(next: Tab) {
    if (busy) return;
    startTransition(() => {
      setTab(next);
      setQuery("");
      setFeedback(null);
      setShowAdd(false);
      setAdminEditor(null);
    });
  }
  async function run(action: () => Promise<string>): Promise<boolean> {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setFeedback(null);
    let saved = false;
    try {
      const message = await action();
      saved = true;
      const [loaded, staff] = await Promise.all([
        loadCloudData(),
        loadStaffExtras(role),
      ]);
      setData(loaded);
      setExtras(staff);
      setLoadError(null);
      setFeedback({ type: "success", message });
      return true;
    } catch (error) {
      fail(
        `${saved ? "Изменения сохранены, но список не обновился. " : ""}${cloudError(error)}`,
      );
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function addStudents() {
    await run(async () => {
      const rows = namesText
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const [name, password] = line.split("|").map((part) => part.trim());
          return {
            name: name.replace(/\s+/gu, " "),
            password: password || randomPassword(),
          };
        });
      if (rows.length < 1 || rows.length > 30)
        throw new Error("Введите от 1 до 30 имён, каждое с новой строки.");
      if (
        rows.some(
          (row) =>
            !row.name ||
            row.name.length > 200 ||
            row.password.length < 8 ||
            row.password.length > 128,
        )
      )
        throw new Error(
          "Имя — до 200 символов, пароль — от 8 до 128 символов.",
        );
      const result = await addCloudStudents(rows);
      setCredentials(rows.filter((row) => result.created.includes(row.name)));
      if (result.errors.length) {
        // Keep only failed rows so retrying cannot recreate successful accounts.
        setNamesText(
          rows
            .filter((row) => !result.created.includes(row.name))
            .map((row) => `${row.name} | ${row.password}`)
            .join("\n"),
        );
        const [loaded, staff] = await Promise.all([
          loadCloudData(),
          loadStaffExtras(role),
        ]);
        setData(loaded);
        setExtras(staff);
        throw new Error(
          `Добавлено: ${result.created.length}. ${result.errors.slice(0, 2).join(" ")}${result.errors.length > 2 ? ` Ещё ошибок: ${result.errors.length - 2}.` : ""}`,
        );
      }
      setNamesText("");
      setShowAdd(false);
      return `Добавлено учеников: ${result.created.length}.`;
    });
  }
  async function changePassword(id: string, password: string) {
    return run(async () => {
      if (password.length < 8 || password.length > 128)
        throw new Error("Пароль должен содержать от 8 до 128 символов.");
      await manageCloudStudents({ action: "password", id, password });
      return "Новый пароль сохранён.";
    });
  }
  function deleteStudent(id: string, name: string) {
    if (!window.confirm(`Удалить ученика ${name}, его баллы и награды?`))
      return;
    void run(async () => {
      await manageCloudStudents({ action: "delete", id });
      setSelected((current) => current.filter((item) => item !== id));
      return "Ученик удалён.";
    });
  }
  async function saveAdministrator(id: string, limits: AdministratorLimits) {
    return run(async () => {
      if (!id) throw new Error("Выберите ученика.");
      if (
        Object.values(limits).some(
          (value) => !Number.isInteger(value) || value < 0 || value > 1000000,
        )
      )
        throw new Error("Укажите целые ограничения от 0 до 1000000.");
      await configureStudentAdministrator(id, limits);
      setAdminEditor(null);
      return "Права администратора сохранены.";
    });
  }
  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function selectedIds() {
    if (!safeSelected.length)
      throw new Error("Выберите хотя бы одного ученика.");
    if (safeSelected.length > 100)
      throw new Error("За один раз можно выбрать до 100 учеников.");
    return safeSelected;
  }
  async function givePoints() {
    await run(async () => {
      const ids = selectedIds(),
        value = Number(amount);
      if (!Number.isInteger(value) || value === 0 || Math.abs(value) > 1000000)
        throw new Error(
          "Введите ненулевое целое число баллов от −1000000 до 1000000.",
        );
      await awardCloudNuts(ids, value);
      return `${value > 0 ? "Начислены" : "Списаны"} баллы: ${number(Math.abs(value))} × ${ids.length}.`;
    });
  }
  async function giveAward() {
    await run(async () => {
      const ids = selectedIds();
      if (!title.trim() || title.trim().length > 300)
        throw new Error("Введите название награды до 300 символов.");
      await awardCloudAchievement(ids, title);
      setTitle("");
      return "Награда выдана выбранным ученикам.";
    });
  }
  async function logout() {
    await run(async () => {
      await signOutCloud();
      router.replace(`/${role}/`);
      return "Вы вышли из кабинета.";
    });
  }

  if (!data)
    return (
      <div className="teacher-workspace teacher-loading">
        <h1>
          {loadError ? "Не удалось загрузить кабинет" : "Загружаем кабинет…"}
        </h1>
        {loadError && (
          <>
            <p role="alert">{loadError}</p>
            <button
              type="button"
              className="teacher-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Повторить
            </button>
          </>
        )}
      </div>
    );

  const pageTitle =
    destinations.find((item) => item.id === tab)?.label ?? "Обзор";
  const recent = data.students
    .flatMap((student) =>
      student.achievements.map((award) => ({ ...award, name: student.name })),
    )
    .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt))
    .slice(0, 5);
  const editorAssignment = extras.administrators.find(
    (item) => item.student_id === adminEditor,
  );
  return (
    <div
      className="teacher-workspace"
      onChangeCapture={() => setFeedback(null)}
    >
      <header className="teacher-heading">
        <div>
          <p>{teacher ? "Преподаватель" : "Администратор"}</p>
          <h1>{actor?.name ?? "Управление классом"}</h1>
        </div>
        <div className="teacher-heading-actions">
          {!teacher && (
            <Link href="/student/dashboard/" className="teacher-button subtle">
              <ArrowLeft size={16} aria-hidden="true" />
              Мой дневник
            </Link>
          )}
          <button
            type="button"
            className="teacher-button"
            disabled={busy}
            onClick={() => void logout()}
          >
            <LogOut size={16} aria-hidden="true" />
            Выйти
          </button>
        </div>
      </header>
      <div className="teacher-layout">
        <nav className="teacher-navigation" aria-label="Разделы кабинета">
          {destinations
            .filter((item) => teacher || item.id !== "administrators")
            .map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                onClick={() => choose(item.id)}
                aria-current={tab === item.id ? "page" : undefined}
              >
                <item.icon size={18} aria-hidden="true" />
                {item.label}
                {item.id === "students" && (
                  <small>{data.students.length}</small>
                )}
              </button>
            ))}
        </nav>
        <div className="teacher-content">
          {tab !== "homework" && tab !== "attendance" && (
            <div className="teacher-page-heading">
              <h2>{pageTitle}</h2>
              {tab === "students" && (
                <button
                  type="button"
                  className="teacher-button primary"
                  disabled={busy}
                  onClick={() => {
                    setShowAdd((value) => !value);
                    setFeedback(null);
                  }}
                >
                  <Plus size={18} aria-hidden="true" />
                  {showAdd ? "Закрыть форму" : "Добавить учеников"}
                </button>
              )}
              {tab === "administrators" && adminEditor === null && (
                <button
                  type="button"
                  className="teacher-button primary"
                  disabled={busy || !extras.available}
                  onClick={() => setAdminEditor("")}
                >
                  <Plus size={18} aria-hidden="true" />
                  Назначить
                </button>
              )}
            </div>
          )}
          {loadError && (
            <p className="teacher-inline-error" role="status">
              Не удалось обновить данные. Показана последняя версия.{" "}
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Повторить
              </button>
            </p>
          )}
          {!teacher &&
            extras.quota &&
            tab !== "attendance" &&
            tab !== "homework" && (
              <section
                className="teacher-quota"
                aria-label="Ограничения администратора"
              >
                <div className="teacher-section-heading">
                  <h3>Ваши ограничения</h3>
                  <span>Дневной сброс в 00:00 МСК</span>
                </div>
                <dl>
                  {(
                    Object.keys(limitLabels) as (keyof AdministratorLimits)[]
                  ).map((key) => {
                    const used =
                      key === "capacity"
                        ? data.students.length
                        : extras.quota!.used[key];
                    const cap = extras.quota!.limits[key];
                    return (
                      <div key={key}>
                        <dt>{limitLabels[key]}</dt>
                        <dd>
                          {number(used)} <span>/ {number(cap)}</span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            )}
          <ViewTransition
            key={tab}
            default="none"
            enter="workspace-tab-in"
            exit="workspace-tab-out"
          >
            <fieldset
              className="teacher-fields"
              disabled={busy}
              aria-busy={busy}
            >
              {credentials.length > 0 && (
                <section className="teacher-credentials">
                  <div className="teacher-section-heading">
                    <h3>Данные новых учеников</h3>
                    <button
                      type="button"
                      className="teacher-button subtle"
                      onClick={() => setCredentials([])}
                    >
                      <X size={16} aria-hidden="true" />
                      Скрыть
                    </button>
                  </div>
                  <textarea
                    readOnly
                    rows={Math.min(6, credentials.length + 1)}
                    aria-label="Логины и пароли новых учеников"
                    value={credentials
                      .map((row) => `${row.name} | ${row.password}`)
                      .join("\n")}
                  />
                  <div className="teacher-inline-actions">
                    <p className="teacher-hint">
                      Передайте каждому только его логин и пароль.
                    </p>
                    <button
                      type="button"
                      className="teacher-button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            credentials
                              .map((row) => `${row.name} | ${row.password}`)
                              .join("\n"),
                          );
                          setFeedback({
                            type: "success",
                            message: "Данные скопированы.",
                          });
                        } catch {
                          fail("Выделите данные в поле и скопируйте вручную.");
                        }
                      }}
                    >
                      <Copy size={16} aria-hidden="true" />
                      Скопировать
                    </button>
                  </div>
                </section>
              )}
              {tab === "overview" && (
                <>
                  <StatsGrid stats={stats} />
                  <div className="teacher-overview-grid">
                    <section className="teacher-section">
                      <div className="teacher-section-heading">
                        <h2>Участие класса</h2>
                        <button
                          type="button"
                          className="teacher-button subtle"
                          onClick={() => choose("students")}
                        >
                          К ученикам
                        </button>
                      </div>
                      <dl className="teacher-facts">
                        <div>
                          <dt>С положительным балансом</dt>
                          <dd>
                            {stats.withPoints} из {stats.totalStudents}
                          </dd>
                        </div>
                        <div>
                          <dt>С наградами</dt>
                          <dd>
                            {stats.withAchievements} из {stats.totalStudents}
                          </dd>
                        </div>
                        <div>
                          <dt>Охват наградами</dt>
                          <dd>{stats.achievementCoverage}%</dd>
                        </div>
                        <div>
                          <dt>Без наград</dt>
                          <dd>
                            {stats.totalStudents - stats.withAchievements}
                          </dd>
                        </div>
                        <div>
                          <dt>Новых за 7 дней</dt>
                          <dd>{stats.newThisWeek}</dd>
                        </div>
                      </dl>
                    </section>
                    <section className="teacher-section">
                      <div className="teacher-section-heading">
                        <h2>Баланс класса</h2>
                        <button
                          type="button"
                          className="teacher-button subtle"
                          onClick={() => choose("awards")}
                        >
                          Выдать награду
                        </button>
                      </div>
                      <dl className="teacher-facts">
                        <div>
                          <dt>Медиана</dt>
                          <dd>{number(stats.medianNuts)}</dd>
                        </div>
                        <div>
                          <dt>Наибольший баланс</dt>
                          <dd>{number(stats.maximumNuts)}</dd>
                        </div>
                        <div>
                          <dt>Наименьший баланс</dt>
                          <dd>{number(stats.minimumNuts)}</dd>
                        </div>
                        <div>
                          <dt>Наград за 7 дней</dt>
                          <dd>{stats.awardsThisWeek}</dd>
                        </div>
                      </dl>
                    </section>
                  </div>
                  <TeacherCharts students={data.students} />
                  <div className="teacher-overview-grid">
                    <section className="teacher-section">
                      <div className="teacher-section-heading">
                        <h2>Рейтинг</h2>
                        <span>Первые пять</span>
                      </div>
                      <ol className="teacher-ranking">
                        {ranked.slice(0, 5).map((student, index) => (
                          <ViewTransition
                            key={student.id}
                            default="none"
                            update="auto"
                          >
                            <li>
                              <span>{index + 1}</span>
                              <strong>{student.name}</strong>
                              <span>{number(student.nuts)} б.</span>
                            </li>
                          </ViewTransition>
                        ))}
                      </ol>
                      {!ranked.length && (
                        <p className="teacher-empty">
                          Добавьте учеников, чтобы увидеть рейтинг.
                        </p>
                      )}
                    </section>
                    <section className="teacher-section">
                      <div className="teacher-section-heading">
                        <h2>Последние награды</h2>
                      </div>
                      <ul className="teacher-recent-awards">
                        {recent.map((award) => (
                          <li key={award.id}>
                            <Award size={17} aria-hidden="true" />
                            <div>
                              <strong>{award.title}</strong>
                              <p>{award.name}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {!recent.length && (
                        <p className="teacher-empty">
                          Награды пока не выдавались.
                        </p>
                      )}
                    </section>
                  </div>
                </>
              )}
              {tab === "students" && (
                <>
                  {showAdd && (
                    <form
                      noValidate
                      className="teacher-add-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addStudents();
                      }}
                    >
                      <div>
                        <h3>Новые ученики</h3>
                        <p className="teacher-hint">
                          Каждое имя с новой строки. Пароль создадим
                          автоматически. Свой можно задать так: Имя Фамилия |
                          пароль.
                        </p>
                      </div>
                      <div className="teacher-field">
                        <label htmlFor="new-students">Имена и фамилии</label>
                        <textarea
                          ref={addField}
                          id="new-students"
                          name="student-names"
                          rows={4}
                          autoComplete="off"
                          value={namesText}
                          onChange={(event) => setNamesText(event.target.value)}
                          placeholder={"Иванов Иван\nПетрова Анна"}
                        />
                        <div className="teacher-inline-actions">
                          <button
                            type="submit"
                            className="teacher-button primary"
                          >
                            Создать аккаунты
                          </button>
                          <button
                            type="button"
                            className="teacher-button subtle"
                            onClick={() => setShowAdd(false)}
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                  <section className="teacher-section teacher-class">
                    <div className="teacher-list-toolbar">
                      <div className="teacher-search">
                        <Search size={18} aria-hidden="true" />
                        <input
                          name="student-search"
                          type="search"
                          autoComplete="off"
                          value={query}
                          aria-label="Поиск ученика"
                          placeholder="Поиск по имени…"
                          onChange={(event) => setQuery(event.target.value)}
                        />
                      </div>
                      <select
                        aria-label="Сортировка учеников"
                        name="student-sort"
                        value={sort}
                        onChange={(event) =>
                          startTransition(() => setSort(event.target.value))
                        }
                      >
                        <option value="name">По имени</option>
                        <option value="points">По баллам</option>
                      </select>
                    </div>
                    <div className="teacher-selection-bar">
                      <span>
                        {safeSelected.length
                          ? `Выбрано: ${safeSelected.length}`
                          : `Всего: ${data.students.length}`}
                      </span>
                      {safeSelected.length > 0 && (
                        <>
                          <button
                            type="button"
                            className="teacher-button subtle"
                            onClick={() => choose("awards")}
                          >
                            Выдать награду
                          </button>
                          <button
                            type="button"
                            className="teacher-button subtle"
                            onClick={() => setSelected([])}
                          >
                            Снять выбор
                          </button>
                        </>
                      )}
                    </div>
                    <div className="teacher-table-head" aria-hidden="true">
                      <span>Ученик</span>
                      <span>Баллы</span>
                      <span>Награды</span>
                      <span>Управление</span>
                    </div>
                    <ul className="teacher-students">
                      {visible.map((student) => {
                        const protectedRow =
                          !teacher && adminIds.has(student.id);
                        return (
                          <ViewTransition
                            key={student.id}
                            default="none"
                            update="auto"
                          >
                            <li>
                              <div className="teacher-student-row">
                                <label className="teacher-student-name">
                                  <input
                                    type="checkbox"
                                    disabled={protectedRow}
                                    checked={safeSelected.includes(student.id)}
                                    onChange={() => toggle(student.id)}
                                    aria-label={`Выбрать: ${student.name}`}
                                  />
                                  <span>
                                    <strong>{student.name}</strong>
                                    {adminIds.has(student.id) && (
                                      <small>Администратор</small>
                                    )}
                                  </span>
                                </label>
                                <div className="teacher-row-number">
                                  {number(student.nuts)}
                                  <small>баллы</small>
                                </div>
                                <div className="teacher-row-number">
                                  {student.achievements.length}
                                  <small>награды</small>
                                </div>
                                <div className="teacher-row-actions">
                                  {teacher && !adminIds.has(student.id) && (
                                    <button
                                      type="button"
                                      className="teacher-button subtle"
                                      aria-label={`Назначить администратором: ${student.name}`}
                                      disabled={!extras.available}
                                      onClick={() => {
                                        startTransition(() => {
                                          setTab("administrators");
                                          setAdminEditor(student.id);
                                        });
                                      }}
                                    >
                                      <ShieldCheck
                                        size={16}
                                        aria-hidden="true"
                                      />
                                      Назначить
                                    </button>
                                  )}
                                  {!protectedRow && (
                                    <StudentAccess
                                      id={student.id}
                                      name={student.name}
                                      teacher={teacher}
                                      onError={fail}
                                      onPassword={(password) =>
                                        changePassword(student.id, password)
                                      }
                                      onDelete={() =>
                                        deleteStudent(student.id, student.name)
                                      }
                                    />
                                  )}
                                </div>
                              </div>
                            </li>
                          </ViewTransition>
                        );
                      })}
                    </ul>
                    {!visible.length && (
                      <div className="teacher-empty">
                        <p>
                          {query
                            ? "Ученики не найдены."
                            : "В классе пока нет учеников."}
                        </p>
                        <button
                          type="button"
                          className="teacher-button"
                          onClick={() =>
                            query ? setQuery("") : setShowAdd(true)
                          }
                        >
                          {query ? "Сбросить поиск" : "Добавить учеников"}
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}
              {tab === "awards" && (
                <div className="teacher-awards-layout">
                  <section className="teacher-section">
                    <div className="teacher-section-heading">
                      <h2>Получатели</h2>
                      <span>{safeSelected.length} выбрано</span>
                    </div>
                    <div className="teacher-search">
                      <Search size={18} aria-hidden="true" />
                      <input
                        name="award-search"
                        type="search"
                        autoComplete="off"
                        aria-label="Поиск получателя"
                        placeholder="Поиск по имени…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </div>
                    <div className="teacher-inline-actions">
                      <button
                        type="button"
                        className="teacher-button subtle"
                        onClick={() => {
                          if (eligible.length > 100) {
                            fail(
                              "За один раз можно выбрать до 100 учеников. Уточните поиск.",
                            );
                            return;
                          }
                          setSelected(eligible.map((s) => s.id));
                        }}
                      >
                        Выбрать найденных
                      </button>
                      <button
                        type="button"
                        className="teacher-button subtle"
                        onClick={() => setSelected([])}
                      >
                        Снять выбор
                      </button>
                    </div>
                    <ul className="teacher-recipients">
                      {eligible.map((student) => (
                        <li key={student.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={safeSelected.includes(student.id)}
                              onChange={() => toggle(student.id)}
                            />
                            <span>{student.name}</span>
                            <small>{number(student.nuts)} б.</small>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {!eligible.length && (
                      <p className="teacher-empty">Подходящих учеников нет.</p>
                    )}
                  </section>
                  <div className="teacher-award-forms">
                    <form
                      noValidate
                      className="teacher-section"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void givePoints();
                      }}
                    >
                      <h2>Баллы</h2>
                      <div className="teacher-field">
                        <label htmlFor="award-amount">
                          Каждому выбранному ученику
                        </label>
                        <input
                          id="award-amount"
                          name="amount"
                          type="number"
                          step={1}
                          min={-1000000}
                          max={1000000}
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                        />
                      </div>
                      <div className="teacher-quick-amounts">
                        {[1, 5, 10, 25].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className="teacher-button"
                            aria-pressed={amount === String(value)}
                            onClick={() => setAmount(String(value))}
                          >
                            +{value}
                          </button>
                        ))}
                      </div>
                      <p className="teacher-hint">
                        Минус перед числом спишет баллы.
                        {!teacher &&
                          ` Расход лимита: ${number(Number.isFinite(Number(amount)) ? Math.abs(Number(amount)) * safeSelected.length : 0)}.`}
                      </p>
                      <button type="submit" className="teacher-button primary">
                        {Number(amount) < 0
                          ? "Списать баллы"
                          : "Начислить баллы"}
                      </button>
                    </form>
                    <form
                      noValidate
                      className="teacher-section"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void giveAward();
                      }}
                    >
                      <h2>Награда</h2>
                      <div className="teacher-field">
                        <label htmlFor="award-title">Название</label>
                        <input
                          id="award-title"
                          name="achievement"
                          autoComplete="off"
                          maxLength={300}
                          value={title}
                          onChange={(event) => setTitle(event.target.value)}
                          placeholder="Например, работа в команде"
                        />
                      </div>
                      <button type="submit" className="teacher-button primary">
                        Выдать награду
                      </button>
                    </form>
                  </div>
                </div>
              )}
              {tab === "administrators" && teacher && (
                <>
                  {!extras.available ? (
                    <section className="teacher-section">
                      <h3>Нужно обновить Supabase</h3>
                      <p className="teacher-hint">
                        Назначение и ограничения станут доступны после
                        применения обновления базы.
                      </p>
                    </section>
                  ) : (
                    <>
                      {adminEditor !== null && (
                        <AdministratorSettings
                          key={adminEditor}
                          students={data.students}
                          initialId={adminEditor || undefined}
                          initialLimits={
                            editorAssignment
                              ? limitsFor(editorAssignment)
                              : undefined
                          }
                          onEdit={() => setFeedback(null)}
                          onSave={saveAdministrator}
                          onCancel={() => setAdminEditor(null)}
                        />
                      )}
                      <section className="teacher-section">
                        <p className="teacher-hint">
                          Администратор входит по своему ученическому логину и
                          паролю. Его результаты и личный дневник сохраняются.
                        </p>
                        <ul className="teacher-administrators">
                          {extras.administrators.map((assigned) => {
                            const student = data.students.find(
                              (s) => s.id === assigned.student_id,
                            );
                            if (!student) return null;
                            return (
                              <li key={assigned.student_id}>
                                <div>
                                  <strong>{student.name}</strong>
                                  <dl>
                                    <div>
                                      <dt>В классе</dt>
                                      <dd>до {assigned.capacity_limit}</dd>
                                    </div>
                                    <div>
                                      <dt>Удаления</dt>
                                      <dd>{assigned.deleted_limit}/день</dd>
                                    </div>
                                    <div>
                                      <dt>Баллы</dt>
                                      <dd>{assigned.points_limit}/день</dd>
                                    </div>
                                    <div>
                                      <dt>Награды</dt>
                                      <dd>{assigned.awards_limit}/день</dd>
                                    </div>
                                  </dl>
                                </div>
                                <div className="teacher-inline-actions">
                                  <button
                                    type="button"
                                    className="teacher-button"
                                    onClick={() =>
                                      setAdminEditor(assigned.student_id)
                                    }
                                  >
                                    Ограничения
                                  </button>
                                  <button
                                    type="button"
                                    className="teacher-button subtle"
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          `Снять права администратора у ${student.name}? Ученик и его результаты сохранятся.`,
                                        )
                                      )
                                        void run(async () => {
                                          await configureStudentAdministrator(
                                            student.id,
                                            limitsFor(assigned),
                                            false,
                                          );
                                          return "Права администратора сняты.";
                                        });
                                    }}
                                  >
                                    Снять права
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        {!extras.administrators.length && (
                          <p className="teacher-empty">
                            Выберите ученика и назначьте его администратором.
                          </p>
                        )}
                      </section>
                    </>
                  )}
                </>
              )}
              {tab === "attendance" && (
                <AttendanceRegister students={data.students} />
              )}
              {tab === "homework" && <HomeworkBoard editable />}
              {tab === "activity" && (
                <section className="teacher-section">
                  <div className="teacher-section-heading">
                    <h2>{teacher ? "Действия в классе" : "Мои действия"}</h2>
                    <span>Время по Москве</span>
                  </div>
                  {extras.available ? (
                    <ActivityList entries={extras.activity} />
                  ) : (
                    <p className="teacher-empty">
                      Журнал появится после обновления базы.
                    </p>
                  )}
                  {extras.moreActivity && (
                    <p className="teacher-hint">
                      Показаны последние 200 записей.
                    </p>
                  )}
                </section>
              )}
            </fieldset>
          </ViewTransition>
          {busy && (
            <p className="teacher-saving" role="status">
              <Check size={15} aria-hidden="true" />
              Сохраняем…
            </p>
          )}
        </div>
      </div>
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </div>
  );
}
