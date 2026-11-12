"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Link2,
  Pencil,
  Plus,
  Presentation,
  Upload,
  X,
} from "lucide-react";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
import { useLessons } from "@/hooks/use-lessons";
import { moscowDate, shiftAttendanceMonth } from "@/lib/attendance";
import { lessonPresentationUrl, saveLesson } from "@/lib/lesson-store";
import {
  lessonDraftError,
  MAX_LESSON_PRESENTATIONS,
  presentationFileError,
  presentationLink,
  type ClassroomLesson,
  type LessonDraft,
  type LessonPresentation,
} from "@/lib/lesson-materials";
import { cloudError } from "@/lib/supabase";
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});
const monthFormat = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});
function dateLabel(value: string) {
  return dateFormat.format(new Date(`${value}T12:00:00Z`));
}
function fileLabel(item: LessonPresentation) {
  if (item.kind === "link") return "По ссылке";
  const format = item.mime_type === "application/pdf" ? "PDF" : "PPTX";
  return `${format} · ${((item.size_bytes ?? 0) / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}
function PresentationViewer({
  item,
  onClose,
}: {
  item: LessonPresentation;
  onClose: () => void;
}) {
  const [state, setState] = useState<{
    url: string | null;
    error: string | null;
  }>({ url: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void lessonPresentationUrl(item)
      .then((url) => {
        if (alive) setState({ url, error: null });
      })
      .catch((reason) => {
        if (alive) setState({ url: null, error: cloudError(reason) });
      });
    return () => {
      alive = false;
    };
  }, [item, attempt]);
  const pdf = item.mime_type === "application/pdf";
  return (
    <section
      className="lesson-preview"
      aria-label={`Презентация: ${item.title}`}
    >
      <div className="lesson-preview-heading">
        <strong>{item.title}</strong>
        <button
          type="button"
          className="teacher-button subtle"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
          Закрыть
        </button>
      </div>
      {!state.url && !state.error && (
        <p role="status">Открываем презентацию…</p>
      )}
      {state.error && (
        <div className="homework-load-error" role="status">
          <p>{state.error}</p>
          <button
            type="button"
            className="teacher-button"
            onClick={() => {
              setState({ url: null, error: null });
              setAttempt((value) => value + 1);
            }}
          >
            Повторить
          </button>
        </div>
      )}
      {state.url && (
        <>
          {pdf && (
            <iframe
              title={item.title}
              src={state.url}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-downloads"
            />
          )}
          <a
            className="teacher-button"
            href={state.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ArrowUpRight size={16} aria-hidden="true" />
            {pdf ? "Открыть PDF в новой вкладке" : "Скачать PPTX"}
          </a>
          {!pdf && (
            <p className="lesson-note">
              Файл откроется в PowerPoint, Keynote или другом приложении для
              презентаций.
            </p>
          )}
        </>
      )}
    </section>
  );
}
export function LessonDetails({
  lesson,
  onBack,
  onEdit,
}: {
  lesson: ClassroomLesson;
  onBack: () => void;
  onEdit?: () => void;
}) {
  const [presentation, setPresentation] = useState<LessonPresentation | null>(
    null,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const active =
    presentation &&
    lesson.presentations.find(
      (item) =>
        item.id === presentation.id &&
        item.storage_path === presentation.storage_path,
    );
  return (
    <article className="lesson-detail">
      <div className="lesson-detail-tools">
        <button
          className="teacher-button subtle"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Все занятия
        </button>
        {onEdit && (
          <button className="teacher-button" type="button" onClick={onEdit}>
            <Pencil size={15} aria-hidden="true" />
            Редактировать
          </button>
        )}
      </div>
      <header className="lesson-detail-heading">
        <time dateTime={lesson.lesson_date}>
          {dateLabel(lesson.lesson_date)}
        </time>
        <h2 tabIndex={-1} ref={heading}>
          {lesson.title}
        </h2>
        {!lesson.published && (
          <span className="lesson-status">Видно только преподавателю</span>
        )}
      </header>
      {lesson.cancelled && (
        <p className="lesson-cancellation">
          Занятие отменено
          {lesson.cancellation_reason ? `: ${lesson.cancellation_reason}` : "."}
        </p>
      )}
      <section className="lesson-section">
        <h3>Что было на занятии</h3>
        <p className="lesson-body">
          {lesson.body || "Описание пока не добавлено."}
        </p>
      </section>
      <section className="lesson-section">
        <h3>
          Презентации <span>{lesson.presentations.length}</span>
        </h3>
        {lesson.presentations.length ? (
          <ul className="lesson-presentations">
            {lesson.presentations.map((item) => {
              const Icon = item.kind === "link" ? Link2 : FileText;
              const contents = (
                <>
                  <Icon size={21} aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{fileLabel(item)}</small>
                  </span>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </>
              );
              const url =
                item.kind === "link" ? presentationLink(item.url ?? "") : null;
              return (
                <li key={item.id}>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {contents}
                    </a>
                  ) : item.kind === "file" ? (
                    <button
                      type="button"
                      onClick={() => setPresentation(item)}
                      aria-expanded={active?.id === item.id}
                    >
                      {contents}
                    </button>
                  ) : (
                    <span>Ссылка недоступна</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="lesson-note">Презентаций пока нет.</p>
        )}
        {active && (
          <PresentationViewer
            key={active.id}
            item={presentation!}
            onClose={() => setPresentation(null)}
          />
        )}
      </section>
      <section className="lesson-section lesson-homework">
        <h3>
          <BookOpen size={20} aria-hidden="true" />
          Домашнее задание
        </h3>
        {lesson.homework_due && (
          <time dateTime={lesson.homework_due}>
            К {dateLabel(lesson.homework_due)}
          </time>
        )}
        <p className="lesson-body">
          {lesson.homework || "Домашнее задание не задано."}
        </p>
      </section>
    </article>
  );
}
export function LessonEditor({
  initial,
  busy,
  progress,
  onSubmit,
  onCancel,
  onFeedback,
}: {
  initial: LessonDraft;
  busy: boolean;
  progress: string;
  onSubmit: (draft: LessonDraft) => void;
  onCancel: () => void;
  onFeedback: (feedback: Feedback) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const fileInput = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleInput.current?.focus();
  }, []);
  function edit<K extends keyof LessonDraft>(key: K, value: LessonDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const error = lessonDraftError(draft);
    if (error) {
      onFeedback({ type: "error", message: error });
      return;
    }
    onSubmit(draft);
  }
  function addFiles(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files);
    if (added.length + draft.presentations.length > MAX_LESSON_PRESENTATIONS) {
      onFeedback({
        type: "error",
        message: "К занятию можно прикрепить до 10 презентаций.",
      });
      return;
    }
    for (const file of added) {
      const error = presentationFileError(file);
      if (error) {
        onFeedback({ type: "error", message: error });
        return;
      }
    }
    edit("presentations", [
      ...draft.presentations,
      ...added.map((file) => ({
        id: crypto.randomUUID(),
        title: file.name.replace(/\.(pdf|pptx)$/i, ""),
        kind: "file" as const,
        file,
        file_name: file.name,
        size_bytes: file.size,
        url: null,
        storage_path: null,
        mime_type: /\.pdf$/i.test(file.name)
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      })),
    ]);
  }
  return (
    <form
      className="lesson-editor"
      noValidate
      onSubmit={submit}
      onChangeCapture={() => onFeedback(null)}
    >
      <fieldset disabled={busy}>
        <legend>
          {initial.revision ? "Редактирование занятия" : "Материалы занятия"}
        </legend>
        <div className="lesson-fields">
          <label>
            Дата занятия
            <input
              type="date"
              required
              value={draft.lesson_date}
              disabled={initial.revision > 0}
              onChange={(event) => edit("lesson_date", event.target.value)}
            />
          </label>
          <label>
            Тема занятия
            <input
              ref={titleInput}
              value={draft.title}
              maxLength={120}
              required
              onChange={(event) => edit("title", event.target.value)}
              placeholder="Например, постановка целей по SMART"
            />
          </label>
        </div>
        <label>
          Что было на занятии
          <textarea
            value={draft.body}
            maxLength={6000}
            onChange={(event) => edit("body", event.target.value)}
            placeholder="Основные темы, примеры и результаты занятия"
            rows={5}
          />
        </label>
        <section
          className="lesson-editor-materials"
          aria-label="Презентации занятия"
        >
          <h3>Презентации</h3>
          <ol>
            {draft.presentations.map((item, index) => (
              <li key={item.id}>
                <div className="lesson-attachment-fields">
                  <label>
                    Название презентации
                    <input
                      value={item.title}
                      maxLength={180}
                      onChange={(event) =>
                        edit(
                          "presentations",
                          draft.presentations.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, title: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  {item.kind === "link" ? (
                    <label>
                      Ссылка
                      <input
                        type="url"
                        value={item.url ?? ""}
                        placeholder="https://…"
                        onChange={(event) =>
                          edit(
                            "presentations",
                            draft.presentations.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, url: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </label>
                  ) : (
                    <p className="lesson-note">
                      {item.file_name} · {fileLabel(item)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="teacher-button subtle"
                  aria-label={`Убрать презентацию ${index + 1}`}
                  onClick={() =>
                    edit(
                      "presentations",
                      draft.presentations.filter(
                        (entry) => entry.id !== item.id,
                      ),
                    )
                  }
                >
                  <X size={16} aria-hidden="true" />
                  Убрать
                </button>
              </li>
            ))}
          </ol>
          <div className="lesson-editor-actions">
            <input
              hidden
              ref={fileInput}
              type="file"
              accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              multiple
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="teacher-button"
              disabled={draft.presentations.length >= MAX_LESSON_PRESENTATIONS}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={16} aria-hidden="true" />
              Загрузить файлы
            </button>
            <button
              type="button"
              className="teacher-button subtle"
              disabled={draft.presentations.length >= MAX_LESSON_PRESENTATIONS}
              onClick={() =>
                edit("presentations", [
                  ...draft.presentations,
                  {
                    id: crypto.randomUUID(),
                    title: "",
                    kind: "link",
                    url: "",
                    storage_path: null,
                    file_name: null,
                    mime_type: null,
                    size_bytes: null,
                  },
                ])
              }
            >
              <Link2 size={16} aria-hidden="true" />
              Добавить ссылку
            </button>
          </div>
          <p className="lesson-note">
            PDF или PPTX, до 25 МБ на файл. Можно добавить несколько
            презентаций.
          </p>
        </section>
        <label>
          Домашнее задание к этому занятию
          <textarea
            value={draft.homework}
            maxLength={6000}
            onChange={(event) => edit("homework", event.target.value)}
            rows={4}
            placeholder="Что нужно сделать к следующему занятию"
          />
        </label>
        <label className="lesson-due-field">
          Срок ДЗ
          <input
            type="date"
            min={draft.lesson_date}
            value={draft.homework_due}
            onChange={(event) => edit("homework_due", event.target.value)}
          />
        </label>
        <label className="lesson-publish">
          <input
            type="checkbox"
            checked={draft.published}
            onChange={(event) => edit("published", event.target.checked)}
          />
          Показывать ученикам
        </label>
        <div className="lesson-editor-actions">
          <button type="submit" className="teacher-button primary">
            {busy ? progress || "Сохраняем…" : "Сохранить занятие"}
          </button>
          <button
            type="button"
            className="teacher-button subtle"
            onClick={onCancel}
          >
            Отмена
          </button>
          {busy && (
            <span role="status">{progress || "Сохраняем материалы…"}</span>
          )}
        </div>
      </fieldset>
    </form>
  );
}
export function LessonBoard({ editable = false }: { editable?: boolean }) {
  const [month, setMonth] = useState(() => moscowDate().slice(0, 7));
  const { items, ready, error, refresh } = useLessons(month);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<LessonDraft | null>(null);
  const previous = useRef<LessonPresentation[]>([]);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const selectedLesson = items.find((item) => item.id === selected);
  function back() {
    setSelected(null);
    setEditor(null);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function changeMonth(next: string) {
    setMonth(next);
    setSelected(null);
    setEditor(null);
    setFeedback(null);
  }
  function openEditor(item?: ClassroomLesson) {
    previous.current = item?.presentations ?? [];
    setFeedback(null);
    setEditor(
      item
        ? {
            ...item,
            homework_due: item.homework_due ?? "",
            presentations: item.presentations.map((entry) => ({ ...entry })),
          }
        : {
            lesson_date: moscowDate().startsWith(month)
              ? moscowDate()
              : `${month}-01`,
            title: "",
            body: "",
            homework: "",
            homework_due: "",
            published: true,
            revision: 0,
            presentations: [],
          },
    );
  }
  async function save(draft: LessonDraft) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setProgress("");
    setFeedback(null);
    try {
      const id = await saveLesson(draft, previous.current, (done, total) =>
        setProgress(`Загружено ${done} из ${total}`),
      );
      const nextMonth = draft.lesson_date.slice(0, 7);
      if (month !== nextMonth) setMonth(nextMonth);
      else await refresh();
      setEditor(null);
      setSelected(id);
      setFeedback({
        type: "success",
        message: draft.published
          ? "Материалы доступны ученикам."
          : "Материалы сохранены. Ученики их пока не видят.",
      });
    } catch (reason) {
      setFeedback({ type: "error", message: cloudError(reason) });
    } finally {
      lock.current = false;
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <section className="lessons-board" aria-label="Занятия и материалы">
      {editor ? (
        <LessonEditor
          key={`${editor.lesson_date}-${editor.revision}`}
          initial={editor}
          busy={busy}
          progress={progress}
          onSubmit={(draft) => void save(draft)}
          onCancel={back}
          onFeedback={setFeedback}
        />
      ) : selectedLesson ? (
        <LessonDetails
          key={selectedLesson.id}
          lesson={selectedLesson}
          onBack={back}
          onEdit={editable ? () => openEditor(selectedLesson) : undefined}
        />
      ) : (
        <>
          <header className="lessons-heading">
            <h2 ref={heading} tabIndex={-1}>
              Занятия
            </h2>
            {editable && (
              <button
                type="button"
                className="teacher-button"
                onClick={() => openEditor()}
              >
                <Plus size={16} aria-hidden="true" />
                Добавить материалы
              </button>
            )}
          </header>
          <div className="lessons-month">
            <button
              type="button"
              className="teacher-button subtle"
              aria-label="Предыдущий месяц"
              onClick={() => changeMonth(shiftAttendanceMonth(month, -1))}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <label>
              <span className="sr-only">Месяц занятий</span>
              <input
                type="month"
                value={month}
                onChange={(event) => {
                  if (/^\d{4}-\d{2}$/.test(event.target.value))
                    changeMonth(event.target.value);
                }}
                aria-label={monthFormat.format(
                  new Date(`${month}-01T12:00:00Z`),
                )}
              />
            </label>
            <button
              type="button"
              className="teacher-button subtle"
              aria-label="Следующий месяц"
              onClick={() => changeMonth(shiftAttendanceMonth(month, 1))}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          {!ready && (
            <p className="lesson-note" role="status">
              Загружаем занятия…
            </p>
          )}
          {ready && !error && !items.length && (
            <div className="lessons-empty">
              <Presentation size={28} aria-hidden="true" />
              <p>
                {editable
                  ? "В этом месяце пока нет занятий с материалами."
                  : "В этом месяце материалы занятий пока не опубликованы."}
              </p>
              {editable && (
                <button
                  type="button"
                  className="teacher-button"
                  onClick={() => openEditor()}
                >
                  Добавить занятие
                </button>
              )}
            </div>
          )}
          <ul className="lessons-list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setSelected(item.id);
                  }}
                >
                  <time dateTime={item.lesson_date}>
                    {dateLabel(item.lesson_date)}
                  </time>
                  <span className="lesson-list-topic">
                    <strong>{item.title}</strong>
                    <small>
                      {item.cancelled
                        ? "Занятие отменено"
                        : item.published
                          ? `Презентации: ${item.presentations.length}${item.homework ? " · Есть ДЗ" : ""}`
                          : item.revision
                            ? "Не опубликовано"
                            : "Добавить материалы"}
                    </small>
                  </span>
                  <ArrowUpRight size={20} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <div className="homework-load-error" role="status">
          <p>{error}</p>
          <button
            type="button"
            className="teacher-button"
            onClick={() => void refresh()}
          >
            Повторить
          </button>
        </div>
      )}
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </section>
  );
}
