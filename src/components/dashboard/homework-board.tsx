"use client";
import { useRef, useState, type FormEvent } from "react";
import {
  Archive,
  CalendarDays,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useHomework } from "@/hooks/use-homework";
import { archiveHomework, saveHomework, type Homework } from "@/lib/homework";
import { cloudError } from "@/lib/supabase";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
const dueFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});
const editedFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});
function DueDate({ value }: { value: string | null }) {
  return (
    <span className="homework-due">
      <CalendarDays size={15} aria-hidden="true" />
      {value ? (
        <time dateTime={value}>
          К {dueFormat.format(new Date(`${value}T12:00:00Z`))}
        </time>
      ) : (
        "Без срока"
      )}
    </span>
  );
}
export function HomeworkBoard({ editable = false }: { editable?: boolean }) {
  const [archived, setArchived] = useState(false);
  const { items, ready, error, refresh } = useHomework(archived);
  const [editor, setEditor] = useState<{
    id: string;
    title: string;
    body: string;
    due_date: string;
    revision: number;
  } | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const heading = useRef<HTMLInputElement>(null);
  function open(item?: Homework) {
    setFeedback(null);
    setEditor(
      item
        ? { ...item, due_date: item.due_date ?? "" }
        : {
            id: crypto.randomUUID(),
            title: "",
            body: "",
            due_date: "",
            revision: 0,
          },
    );
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({
        block: "nearest",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
  }
  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!editor || lock.current) return;
    setFeedback(null);
    const title = editor.title.trim(),
      body = editor.body.trim();
    if (!title || title.length > 120 || !body || body.length > 6000) {
      setFeedback({
        type: "error",
        message:
          "Укажите название (до 120 символов) и текст задания (до 6000 символов).",
      });
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await saveHomework({
        ...editor,
        title,
        body,
        due_date: editor.due_date || null,
      });
      setEditor(null);
      if (!editor.revision) setArchived(false);
      setFeedback({
        type: "success",
        message: editor.revision
          ? "Задание сохранено."
          : "Задание опубликовано.",
      });
      await refresh();
    } catch (reason) {
      setFeedback({ type: "error", message: cloudError(reason) });
      void refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function archive(item: Homework) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await archiveHomework(item);
      setFeedback({
        type: "success",
        message: item.archived
          ? "Задание возвращено в актуальные."
          : "Задание в архиве.",
      });
      await refresh();
    } catch (reason) {
      setFeedback({ type: "error", message: cloudError(reason) });
      void refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function edit(key: "title" | "body" | "due_date", value: string) {
    setEditor((current) => (current ? { ...current, [key]: value } : null));
    setFeedback(null);
  }
  return (
    <section
      className={`homework-board${editable ? " homework-staff" : ""}`}
      aria-label="Домашние задания"
    >
      <div className="homework-heading">
        <h2>Домашние задания</h2>
        {editable && (
          <button
            type="button"
            className="teacher-button primary"
            disabled={busy}
            onClick={() => open()}
          >
            <Plus size={16} aria-hidden="true" />
            Добавить ДЗ
          </button>
        )}
      </div>
      {editable && (
        <div className="homework-filters" aria-label="Список заданий">
          <button
            type="button"
            aria-pressed={!archived}
            disabled={busy}
            onClick={() => {
              setArchived(false);
              setFeedback(null);
            }}
          >
            Актуальные
          </button>
          <button
            type="button"
            aria-pressed={archived}
            disabled={busy}
            onClick={() => {
              setArchived(true);
              setFeedback(null);
            }}
          >
            Архив
          </button>
        </div>
      )}
      {editable && editor && (
        <form className="homework-editor" onSubmit={publish} noValidate>
          <div className="teacher-section-heading">
            <h3>{editor.revision ? "Изменить задание" : "Новое задание"}</h3>
            <button
              type="button"
              className="chat-icon-button"
              aria-label="Закрыть редактор"
              disabled={busy}
              onClick={() => {
                setEditor(null);
                setFeedback(null);
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <fieldset disabled={busy}>
            <label htmlFor="homework-title">
              Название
              <input
                id="homework-title"
                ref={heading}
                value={editor.title}
                maxLength={120}
                placeholder="Например, Практическая работа № 3"
                onChange={(e) => edit("title", e.target.value)}
              />
            </label>
            <label htmlFor="homework-body">
              Задание
              <textarea
                id="homework-body"
                value={editor.body}
                rows={7}
                maxLength={6000}
                placeholder="Что нужно сделать и подготовить"
                onChange={(e) => edit("body", e.target.value)}
              />
            </label>
            <label className="homework-date-field" htmlFor="homework-date">
              Срок сдачи — необязательно
              <input
                id="homework-date"
                type="date"
                value={editor.due_date}
                onChange={(e) => edit("due_date", e.target.value)}
              />
            </label>
            <div className="homework-editor-actions">
              <button type="submit" className="teacher-button primary">
                {busy
                  ? "Сохраняем…"
                  : editor.revision
                    ? "Сохранить"
                    : "Опубликовать"}
              </button>
              <button
                type="button"
                className="teacher-button subtle"
                onClick={() => {
                  setEditor(null);
                  setFeedback(null);
                }}
              >
                Отмена
              </button>
            </div>
          </fieldset>
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
            Обновить задания
          </button>
        </div>
      )}
      {!ready && (
        <p className="homework-empty" role="status">
          Загружаем задания…
        </p>
      )}
      {ready && !error && !items.length && (
        <p className="homework-empty">
          {archived
            ? "В архиве пока нет заданий."
            : "Актуальных заданий пока нет."}
        </p>
      )}
      <ul className="homework-list" aria-busy={!ready}>
        {items.map((item) => (
          <li key={item.id}>
            <article>
              <div className="homework-item-heading">
                <h3>{item.title}</h3>
                <DueDate value={item.due_date} />
              </div>
              <p className="homework-body">{item.body}</p>
              <footer>
                <p className="homework-author">
                  {item.author_name}
                  <time dateTime={item.updated_at}>
                    {editedFormat.format(new Date(item.updated_at))}
                  </time>
                </p>
                {editable && (
                  <div className="homework-item-actions">
                    <button
                      type="button"
                      className="teacher-button subtle"
                      disabled={busy}
                      onClick={() => open(item)}
                    >
                      <Pencil size={15} aria-hidden="true" />
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="teacher-button subtle"
                      disabled={busy}
                      onClick={() => void archive(item)}
                    >
                      {item.archived ? (
                        <RotateCcw size={15} aria-hidden="true" />
                      ) : (
                        <Archive size={15} aria-hidden="true" />
                      )}
                      {item.archived ? "Вернуть" : "В архив"}
                    </button>
                  </div>
                )}
              </footer>
            </article>
          </li>
        ))}
      </ul>
      {items.length === 200 && (
        <p className="teacher-hint">Показаны первые 200 заданий.</p>
      )}
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </section>
  );
}
