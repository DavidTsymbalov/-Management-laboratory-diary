"use client";
import { useEffect, useRef, useState } from "react";
import type { Student } from "@/data/seed";
import { StudentPicker } from "@/components/ui/student-picker";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
import { loadRemarks, sendRemark, type StudentRemark } from "@/lib/remarks";
import { cloudError } from "@/lib/supabase";
const date = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});
export function RemarksBoard({ students }: { students: Student[] }) {
  const [studentId, setStudentId] = useState(""),
    [body, setBody] = useState(""),
    [items, setItems] = useState<StudentRemark[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [attempt, setAttempt] = useState(0),
    [feedback, setFeedback] = useState<Feedback>(null);
  const lock = useRef(false),
    pending = useRef<{ id: string; student: string; body: string } | null>(
      null,
    );
  useEffect(() => {
    if (!studentId) return;
    let active = true;
    const timer = setTimeout(() => setLoading(true), 0);
    void loadRemarks(studentId)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((error) => {
        if (active) {
          setItems([]);
          setFeedback({ type: "error", message: cloudError(error) });
        }
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [studentId, attempt]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setFeedback(null);
    const text = body.trim();
    if (
      !students.some((student) => student.id === studentId) ||
      !text ||
      Array.from(text).length > 2000
    ) {
      setFeedback({
        type: "error",
        message: "Выберите ученика и введите текст до 2000 символов.",
      });
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      if (
        pending.current?.student !== studentId ||
        pending.current.body !== text
      )
        pending.current = {
          id: crypto.randomUUID(),
          student: studentId,
          body: text,
        };
      await sendRemark(pending.current.id, studentId, text);
      pending.current = null;
      setBody("");
      setAttempt((value) => value + 1);
      setFeedback({ type: "success", message: "Замечание отправлено." });
    } catch (error) {
      setFeedback({ type: "error", message: cloudError(error) });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="remarks-board"
      onChangeCapture={() => setFeedback(null)}
    >
      <h2>Замечания</h2>
      <form noValidate className="remarks-form" onSubmit={submit}>
        <label>
          Ученик
          <StudentPicker
            id="remark-student"
            students={students}
            value={studentId}
            disabled={busy}
            onChange={(id) => {
              setStudentId(id);
              setItems([]);
            }}
          />
        </label>
        <label>
          Текст замечания
          <textarea
            rows={4}
            maxLength={2000}
            value={body}
            disabled={busy}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        <button
          className="teacher-button primary"
          type="submit"
          disabled={busy}
        >
          {busy ? "Отправляем…" : "Отправить замечание"}
        </button>
      </form>
      {studentId && (
        <section className="remarks-history">
          <div className="teacher-section-heading">
            <h3>Отправленные замечания</h3>
            <button
              type="button"
              className="teacher-button subtle"
              disabled={busy || loading}
              onClick={() => setAttempt((value) => value + 1)}
            >
              Обновить
            </button>
          </div>
          {loading ? (
            <p role="status" className="teacher-empty">
              Загружаем…
            </p>
          ) : items.length ? (
            <ol>
              {items.map((item) => (
                <li key={item.id}>
                  <p>{item.body}</p>
                  <footer>
                    <span>{item.author_name}</span>
                    <time dateTime={item.created_at}>
                      {date.format(new Date(item.created_at))}
                    </time>
                    <span>
                      {item.dismissed_at
                        ? "Закрыто учеником"
                        : "Ожидает закрытия"}
                    </span>
                  </footer>
                </li>
              ))}
            </ol>
          ) : (
            <p className="teacher-empty">Замечаний пока нет.</p>
          )}
        </section>
      )}
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </section>
  );
}
