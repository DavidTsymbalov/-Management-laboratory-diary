"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquareWarning } from "lucide-react";
import { getSupabase, cloudError } from "@/lib/supabase";
import { loadRemarks, dismissRemark, type StudentRemark } from "@/lib/remarks";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
export function StudentRemarks({ studentId }: { studentId: string }) {
  const [items, setItems] = useState<StudentRemark[]>([]),
    [busy, setBusy] = useState<string | null>(null),
    [feedback, setFeedback] = useState<Feedback>(null);
  const dismissed = useRef(new Set<string>()),
    requestLock = useRef(false);
  useEffect(() => {
    let active = true,
      inFlight = false;
    async function load() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const data = await loadRemarks(studentId, true);
        if (active)
          setItems(data.filter((item) => !dismissed.current.has(item.id)));
      } catch (error) {
        if (active) setFeedback({ type: "error", message: cloudError(error) });
      } finally {
        inFlight = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    const wake = () => void load();
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    const client = getSupabase(),
      channel = client
        .channel(`remarks-${studentId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "student_remarks",
            filter: `student_id=eq.${studentId}`,
          },
          wake,
        )
        .subscribe();
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
      void client.removeChannel(channel);
    };
  }, [studentId]);
  async function close(id: string) {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(id);
    setFeedback(null);
    try {
      await dismissRemark(id);
      dismissed.current.add(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setFeedback({ type: "error", message: cloudError(error) });
    } finally {
      requestLock.current = false;
      setBusy(null);
    }
  }
  if (typeof document === "undefined" || (!items.length && !feedback))
    return null;
  return createPortal(
    <>
      <div
        className="student-remarks"
        aria-label="Замечания преподавателя"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((item) => (
          <section className="student-remark" key={item.id}>
            <MessageSquareWarning size={20} aria-hidden="true" />
            <div>
              <h2>Замечание от {item.author_name}</h2>
              <p>{item.body}</p>
            </div>
            <button
              type="button"
              className="teacher-button"
              disabled={busy !== null}
              onClick={() => void close(item.id)}
            >
              {busy === item.id ? "Закрываем…" : "Понятно"}
            </button>
          </section>
        ))}
      </div>
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </>,
    document.body,
  );
}
