"use client";
import {
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import {
  ATTENDANCE_STATUSES,
  attendanceSummary,
  monthThursdays,
  moscowDate,
  shiftAttendanceMonth,
  suggestedLessonDate,
  type AttendanceLesson,
  type AttendanceRecord,
  type AttendanceStatus,
} from "@/lib/attendance";
import {
  createAttendanceLessons,
  saveAttendanceMarks,
  setAttendanceLessonState,
} from "@/lib/attendance-store";
import { useAttendance } from "@/hooks/use-attendance";
import { cloudError } from "@/lib/supabase";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
const monthFormat = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});
const weekdayFormat = new Intl.DateTimeFormat("ru-RU", {
  weekday: "short",
  timeZone: "Europe/Moscow",
});
const dateObject = (value: string) => new Date(`${value}T12:00:00Z`);
type JournalRow = {
  id: string;
  name: string;
  current: boolean;
  nameDate: string;
};
type MarkMenu = {
  lesson: AttendanceLesson;
  student: JournalRow;
  record?: AttendanceRecord;
  anchor: { top: number; left: number; bottom: number };
  opener: HTMLButtonElement;
};
function MarkPicker({
  menu,
  onSelect,
  onClose,
}: {
  menu: MarkMenu;
  onSelect: (status: AttendanceStatus | null) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    box.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus({ preventScroll: true });
  }, [menu]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const move = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", move, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", move, true);
      if (
        menu.opener.isConnected &&
        !document.querySelector(".attendance-mark-menu") &&
        document.activeElement === document.body
      )
        menu.opener.focus({ preventScroll: true });
    };
  }, [menu, onClose]);
  function keyboard(event: KeyboardEvent) {
    if (event.key === "Tab") {
      event.preventDefault();
      onClose();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      box.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]',
      ) ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length;
    event.preventDefault();
    buttons[next]?.focus({ preventScroll: true });
  }
  const top =
    menu.anchor.bottom + 8 + 330 <= window.innerHeight
      ? menu.anchor.bottom + 8
      : Math.max(12, menu.anchor.top - 338);
  const left = Math.max(
    12,
    Math.min(menu.anchor.left, window.innerWidth - 284),
  );
  return createPortal(
    <div
      ref={box}
      className="attendance-mark-menu"
      role="menu"
      aria-label={`Посещаемость: ${menu.student.name}`}
      style={{
        top,
        left,
        maxHeight: Math.max(0, window.innerHeight - top - 12),
      }}
      onKeyDown={keyboard}
    >
      <div className="attendance-menu-heading">
        <strong>{menu.student.name}</strong>
        <small>{dateFormat.format(dateObject(menu.lesson.lesson_date))}</small>
      </div>
      {ATTENDANCE_STATUSES.map((status) => (
        <button
          key={status.value}
          type="button"
          role="menuitemradio"
          aria-checked={menu.record?.status === status.value}
          onClick={() => onSelect(status.value)}
        >
          <span className="attendance-symbol" data-status={status.value}>
            {status.short}
          </span>
          {status.label}
        </button>
      ))}
      <button
        type="button"
        role="menuitemradio"
        aria-checked={!menu.record?.status}
        onClick={() => onSelect(null)}
      >
        <span className="attendance-symbol">·</span>Без отметки
      </button>
    </div>,
    document.body,
  );
}
export function AttendanceRegister({
  students,
}: {
  students: { id: string; name: string }[];
}) {
  const [month, setMonth] = useState(() => moscowDate().slice(0, 7));
  const { data, ready, error, refresh, update } = useAttendance(month);
  const [selectedDate, setSelectedDate] = useState("");
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [cancelForm, setCancelForm] = useState(false);
  const [reason, setReason] = useState("");
  const [menu, setMenu] = useState<MarkMenu | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const lock = useRef(false);
  const lessons = data.lessons;
  const selected =
    lessons.find((item) => item.lesson_date === selectedDate) ??
    lessons.find((item) => item.lesson_date >= moscowDate()) ??
    lessons.at(-1) ??
    null;
  const indexes = useMemo(() => {
    const dates = new Map(lessons.map((item) => [item.id, item.lesson_date]));
    const records = new Map(
      data.records.map((item) => [
        `${item.lesson_id}:${item.student_key}`,
        item,
      ]),
    );
    const rows = new Map<string, JournalRow>(
      students.map((item) => [
        item.id,
        { ...item, current: true, nameDate: "" },
      ]),
    );
    const grouped = new Map<string, AttendanceRecord[]>();
    for (const item of data.records) {
      const date = dates.get(item.lesson_id) ?? "";
      const row = rows.get(item.student_key);
      if (!row || (!row.current && row.nameDate < date))
        rows.set(item.student_key, {
          id: item.student_key,
          name: item.student_name,
          current: false,
          nameDate: date,
        });
      const group = grouped.get(item.student_key) ?? [];
      group.push(item);
      grouped.set(item.student_key, group);
    }
    const ordered = [...rows.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "ru"),
    );
    const stats = new Map(
      ordered.map((row) => [
        row.id,
        attendanceSummary(lessons, grouped.get(row.id) ?? []),
      ]),
    );
    return { records, rows: ordered, stats };
  }, [data.records, lessons, students]);
  const filtered = indexes.rows.filter((row) =>
    row.name
      .toLocaleLowerCase("ru-RU")
      .includes(query.trim().toLocaleLowerCase("ru-RU")),
  );
  const selectedRoster = selected
    ? indexes.rows
        .filter(
          (row) =>
            row.current || indexes.records.has(`${selected.id}:${row.id}`),
        )
        .map(
          (row) =>
            indexes.records.get(`${selected.id}:${row.id}`) ?? {
              lesson_id: selected.id,
              student_key: row.id,
              student_name: row.name,
              status: null,
              revision: 0,
            },
        )
    : [];
  const summary = attendanceSummary(selected ? [selected] : [], selectedRoster);
  const currentIds = new Set(students.map((student) => student.id));
  const unmarkedCurrent = selectedRoster.filter(
    (record) => record.status === null && currentIds.has(record.student_key),
  );
  const missingThursdays = monthThursdays(month).filter(
    (date) => !lessons.some((lesson) => lesson.lesson_date === date),
  );
  // The stable callback keeps pointer/keyboard handlers and focus intact while rendering.
  const dismissMenu = useCallback(() => setMenu(null), []);
  function clearFeedback() {
    setFeedback(null);
  }
  function chooseMonth(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    setMonth(value);
    setSelectedDate("");
    setMenu(null);
    setShowAdd(false);
    setCancelForm(false);
    setFeedback(null);
  }
  function chooseLesson(lesson: AttendanceLesson) {
    setSelectedDate(lesson.lesson_date);
    setCancelForm(false);
    setReason("");
    setFeedback(null);
  }
  async function run(action: () => Promise<void>, success?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFeedback(null);
    setMenu(null);
    try {
      await action();
      if (success) setFeedback({ type: "success", message: success });
      await refresh();
    } catch (cause) {
      setFeedback({ type: "error", message: cloudError(cause) });
      void refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function createDates(dates: string[]) {
    await run(
      async () => {
        const saved = await createAttendanceLessons(dates);
        const selectedNew =
          saved.find((item) => item.lesson_date >= moscowDate()) ?? saved[0];
        setSelectedDate(selectedNew?.lesson_date ?? "");
        if (selectedNew && selectedNew.lesson_date.slice(0, 7) !== month)
          setMonth(selectedNew.lesson_date.slice(0, 7));
        setShowAdd(false);
        setCancelForm(false);
      },
      dates.length > 1 ? "Занятия добавлены." : "Занятие добавлено.",
    );
  }
  function submitDate(event: FormEvent) {
    event.preventDefault();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(newDate) ||
      Number.isNaN(dateObject(newDate).getTime()) ||
      dateObject(newDate).toISOString().slice(0, 10) !== newDate
    ) {
      setFeedback({ type: "error", message: "Выберите дату занятия." });
      return;
    }
    void createDates([newDate]);
  }
  async function mark(
    lesson: AttendanceLesson,
    changes: {
      student_key: string;
      status: AttendanceStatus | null;
      expected_revision: number;
    }[],
    success?: string,
  ) {
    await run(async () => {
      const saved = await saveAttendanceMarks(lesson, changes);
      update((current) => {
        const records = new Map(
          current.records.map((item) => [
            `${item.lesson_id}:${item.student_key}`,
            item,
          ]),
        );
        for (const item of saved)
          records.set(`${item.lesson_id}:${item.student_key}`, item);
        return { ...current, records: [...records.values()] };
      });
    }, success);
  }
  function selectMark(status: AttendanceStatus | null) {
    if (!menu) return;
    void mark(menu.lesson, [
      {
        student_key: menu.student.id,
        status,
        expected_revision: menu.record?.revision ?? 0,
      },
    ]);
  }
  function setAllPresent() {
    if (!selected) return;
    const changes = unmarkedCurrent.map((record) => ({
      student_key: record.student_key,
      status: "present" as const,
      expected_revision: record.revision,
    }));
    if (changes.length) void mark(selected, changes, "Присутствие отмечено.");
  }
  async function changeLesson(cancelled: boolean) {
    if (!selected) return;
    await run(
      async () => {
        const saved = await setAttendanceLessonState(
          selected,
          cancelled,
          reason,
        );
        update((current) => ({
          ...current,
          lessons: current.lessons.map((item) =>
            item.id === saved.id ? saved : item,
          ),
        }));
        setCancelForm(false);
        setReason("");
      },
      cancelled
        ? "Занятие отменено. Отметки сохранены."
        : "Занятие восстановлено.",
    );
  }
  function moveCell(
    event: KeyboardEvent<HTMLButtonElement>,
    row: number,
    column: number,
  ) {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const step = steps[event.key];
    if (!step) return;
    const target = event.currentTarget
      .closest("table")
      ?.querySelector<HTMLButtonElement>(
        `button[data-row="${row + step[0]}"][data-column="${column + step[1]}"]:not(:disabled)`,
      );
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }
  return (
    <section
      className="attendance-register"
      aria-labelledby="attendance-heading"
    >
      <div className="attendance-heading">
        <h2 id="attendance-heading">Классный журнал</h2>
        <button
          type="button"
          className="teacher-button primary"
          disabled={busy}
          onClick={() => {
            setShowAdd((value) => !value);
            setNewDate(suggestedLessonDate(month));
            setFeedback(null);
          }}
        >
          <Plus size={17} aria-hidden="true" />
          Добавить занятие
        </button>
      </div>
      <div className="attendance-toolbar">
        <div className="attendance-month">
          <button
            type="button"
            className="chat-icon-button"
            disabled={busy}
            aria-label="Предыдущий месяц"
            onClick={() => chooseMonth(shiftAttendanceMonth(month, -1))}
          >
            <ChevronLeft size={19} aria-hidden="true" />
          </button>
          <label>
            <span className="sr-only">Месяц журнала</span>
            <input
              type="month"
              value={month}
              disabled={busy}
              aria-label="Месяц журнала"
              onChange={(event) => chooseMonth(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="chat-icon-button"
            disabled={busy}
            aria-label="Следующий месяц"
            onClick={() => chooseMonth(shiftAttendanceMonth(month, 1))}
          >
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="teacher-button subtle"
          disabled={busy}
          onClick={() => chooseMonth(moscowDate().slice(0, 7))}
        >
          Текущий месяц
        </button>
        <div className="teacher-search attendance-search">
          <Search size={17} aria-hidden="true" />
          <input
            name="attendance-search"
            type="search"
            value={query}
            autoComplete="off"
            aria-label="Найти ученика в журнале"
            placeholder="Найти ученика…"
            onChange={(event) => {
              setQuery(event.target.value);
              clearFeedback();
            }}
          />
        </div>
      </div>
      {showAdd && (
        <form className="attendance-create" noValidate onSubmit={submitDate}>
          <label htmlFor="attendance-date">
            Дата занятия
            <input
              id="attendance-date"
              type="date"
              value={newDate}
              disabled={busy}
              onChange={(event) => {
                setNewDate(event.target.value);
                clearFeedback();
              }}
            />
          </label>
          <button
            type="submit"
            className="teacher-button primary"
            disabled={busy}
          >
            Добавить
          </button>
          <button
            type="button"
            className="teacher-button subtle"
            disabled={busy}
            onClick={() => setShowAdd(false)}
          >
            Закрыть
          </button>
        </form>
      )}
      {error && (
        <div className="homework-load-error" role="status">
          <p>{error}</p>
          <button
            type="button"
            className="teacher-button subtle"
            onClick={() => void refresh()}
          >
            Обновить журнал
          </button>
        </div>
      )}
      {!ready ? (
        <p className="teacher-empty" role="status">
          Загружаем журнал…
        </p>
      ) : !lessons.length ? (
        <div className="attendance-empty">
          <CalendarDays size={28} aria-hidden="true" />
          <h3>В этом месяце пока нет занятий</h3>
          <p>{monthFormat.format(dateObject(`${month}-01`))}</p>
          {!error && (
            <button
              type="button"
              className="teacher-button"
              disabled={busy}
              onClick={() => void createDates(missingThursdays)}
            >
              Добавить занятия на четверги
            </button>
          )}
        </div>
      ) : (
        <>
          <div
            className="attendance-legend"
            aria-label="Обозначения посещаемости"
          >
            {ATTENDANCE_STATUSES.map((status) => (
              <span key={status.value}>
                <b className="attendance-symbol" data-status={status.value}>
                  {status.short}
                </b>
                {status.label}
              </span>
            ))}
            <span>
              <b className="attendance-symbol">·</b>Без отметки
            </span>
          </div>
          <div
            className="attendance-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Таблица посещаемости; на телефоне прокручивается по горизонтали"
          >
            <table className="attendance-table">
              <caption className="sr-only">
                Посещаемость за {monthFormat.format(dateObject(`${month}-01`))}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="attendance-name-column">
                    Ученик
                  </th>
                  {lessons.map((lesson) => (
                    <th
                      key={lesson.id}
                      scope="col"
                      data-selected={selected?.id === lesson.id}
                      data-cancelled={lesson.cancelled}
                    >
                      <button
                        type="button"
                        className="attendance-date-button"
                        aria-pressed={selected?.id === lesson.id}
                        disabled={busy}
                        aria-label={`${dateFormat.format(dateObject(lesson.lesson_date))}${lesson.cancelled ? ", занятие отменено" : ""}`}
                        onClick={() => chooseLesson(lesson)}
                      >
                        <time dateTime={lesson.lesson_date}>
                          {Number(lesson.lesson_date.slice(-2))}
                        </time>
                        <small>
                          {lesson.cancelled
                            ? "Отм."
                            : weekdayFormat.format(
                                dateObject(lesson.lesson_date),
                              )}
                        </small>
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="attendance-total-column">
                    Посещаемость
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, rowIndex) => {
                  const stats = indexes.stats.get(row.id)!;
                  return (
                    <tr key={row.id}>
                      <th scope="row" className="attendance-name-column">
                        <strong>{row.name}</strong>
                        {!row.current && <small>Удалён из класса</small>}
                      </th>
                      {lessons.map((lesson, column) => {
                        const record = indexes.records.get(
                          `${lesson.id}:${row.id}`,
                        );
                        const status = ATTENDANCE_STATUSES.find(
                          (item) => item.value === record?.status,
                        );
                        return (
                          <td
                            key={lesson.id}
                            data-selected={selected?.id === lesson.id}
                            data-cancelled={lesson.cancelled}
                          >
                            <button
                              type="button"
                              className="attendance-cell"
                              data-row={rowIndex}
                              data-column={column}
                              data-status={record?.status ?? "unmarked"}
                              disabled={
                                busy ||
                                lesson.cancelled ||
                                (!row.current && !record)
                              }
                              aria-label={`${row.name}, ${dateFormat.format(dateObject(lesson.lesson_date))}: ${lesson.cancelled ? "занятие отменено; " : ""}${status?.label ?? "без отметки"}`}
                              onKeyDown={(event) =>
                                moveCell(event, rowIndex, column)
                              }
                              onClick={(event) => {
                                chooseLesson(lesson);
                                const rect =
                                  event.currentTarget.getBoundingClientRect();
                                setMenu({
                                  lesson,
                                  student: row,
                                  record,
                                  anchor: {
                                    top: rect.top,
                                    left: rect.left,
                                    bottom: rect.bottom,
                                  },
                                  opener: event.currentTarget,
                                });
                              }}
                            >
                              {status?.short ??
                                (row.current || record ? "·" : "—")}
                            </button>
                          </td>
                        );
                      })}
                      <td className="attendance-total-column">
                        <span>
                          {stats.percent === null ? "—" : `${stats.percent}%`}
                        </span>
                        <small>
                          {stats.attended} из {stats.marked}
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <p className="teacher-empty">
              {query
                ? "Ученики не найдены."
                : "Добавьте учеников в класс, чтобы отмечать посещаемость."}
            </p>
          )}
          <p className="attendance-calculation">
            Посещаемость: присутствие и опоздания из отмеченных занятий. Отмены
            и пустые отметки не учитываются.
          </p>
          {selected && (
            <section
              className="attendance-lesson"
              aria-label="Выбранное занятие"
            >
              <div className="attendance-lesson-heading">
                <h3>{dateFormat.format(dateObject(selected.lesson_date))}</h3>
                {selected.cancelled && (
                  <span className="attendance-cancelled-label">Отменено</span>
                )}
              </div>
              {selected.cancelled ? (
                <>
                  <p className="attendance-reason">
                    {selected.cancellation_reason || "Причина не указана"}
                  </p>
                  <button
                    type="button"
                    className="teacher-button"
                    disabled={busy}
                    onClick={() => void changeLesson(false)}
                  >
                    Восстановить занятие
                  </button>
                </>
              ) : (
                <>
                  <dl className="attendance-summary">
                    {ATTENDANCE_STATUSES.map((status) => (
                      <div key={status.value}>
                        <dt>{status.label}</dt>
                        <dd>{summary[status.value]}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>Без отметки</dt>
                      <dd>{summary.unmarked}</dd>
                    </div>
                  </dl>
                  <div className="attendance-lesson-actions">
                    <button
                      type="button"
                      className="teacher-button"
                      disabled={busy || !unmarkedCurrent.length}
                      onClick={setAllPresent}
                    >
                      Неотмеченным поставить «П»
                    </button>
                    <button
                      type="button"
                      className="teacher-button subtle"
                      disabled={busy}
                      onClick={() => {
                        setCancelForm((value) => !value);
                        setReason("");
                        clearFeedback();
                      }}
                    >
                      Отменить занятие
                    </button>
                  </div>
                  {cancelForm && (
                    <form
                      className="attendance-cancel-form"
                      noValidate
                      onSubmit={(event) => {
                        event.preventDefault();
                        void changeLesson(true);
                      }}
                    >
                      <label htmlFor="attendance-reason">
                        Причина отмены — необязательно
                        <input
                          id="attendance-reason"
                          value={reason}
                          maxLength={500}
                          disabled={busy}
                          onChange={(event) => {
                            setReason(event.target.value);
                            clearFeedback();
                          }}
                          placeholder="Например, каникулы"
                        />
                      </label>
                      <button
                        type="submit"
                        className="teacher-button"
                        disabled={busy}
                      >
                        Подтвердить отмену
                      </button>
                      <button
                        type="button"
                        className="teacher-button subtle"
                        disabled={busy}
                        onClick={() => setCancelForm(false)}
                      >
                        Закрыть
                      </button>
                    </form>
                  )}
                </>
              )}
            </section>
          )}
          {missingThursdays.length > 0 && (
            <button
              type="button"
              className="teacher-button subtle attendance-add-thursdays"
              disabled={busy || Boolean(error)}
              onClick={() => void createDates(missingThursdays)}
            >
              Добавить остальные четверги месяца
            </button>
          )}
        </>
      )}
      {busy && (
        <p className="attendance-saving" role="status">
          Сохраняем…
        </p>
      )}
      {menu && (
        <MarkPicker menu={menu} onSelect={selectMark} onClose={dismissMenu} />
      )}
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </section>
  );
}
