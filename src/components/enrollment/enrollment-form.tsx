"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
import { enrollmentError, normalizeTelegram, submitEnrollment } from "@/lib/enrollment";

export function EnrollmentForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [telegram, setTelegram] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const locked = useRef(false);
  const firstInput = useRef<HTMLInputElement>(null);
  const lastInput = useRef<HTMLInputElement>(null);
  const telegramInput = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    setFeedback(null);
    for (const [value, field] of [[firstName, firstInput], [lastName, lastInput]] as const) {
      if (!value.trim() || value.trim().length > 80 || !/\p{L}/u.test(value) || /[<>\p{Cc}]/u.test(value)) {
        setFeedback({ type: "error", message: "Введите имя и фамилию: до 80 символов в каждом поле." });
        field.current?.focus();
        return;
      }
    }
    if (!/^[a-z][a-z0-9_]{4,31}$/.test(normalizeTelegram(telegram))) {
      setFeedback({ type: "error", message: "Проверьте Telegram: 5–32 символа, латинские буквы, цифры и подчёркивание; первый символ — буква." });
      telegramInput.current?.focus();
      return;
    }
    const website = String(new FormData(event.currentTarget).get("website") ?? "");
    locked.current = true;
    setBusy(true);
    try {
      await submitEnrollment(firstName, lastName, telegram, website);
      setSent(true);
      setFirstName("");
      setLastName("");
      setTelegram("");
    } catch (error) {
      setFeedback({ type: "error", message: enrollmentError(error) });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="enrollment-form teacher-workspace" onChangeCapture={() => setFeedback(null)}>
      {sent ? (
        <div className="enrollment-confirmation" role="status">
          <Check size={32} strokeWidth={1.5} aria-hidden="true" />
          <h1>Заявка отправлена</h1>
          <p>Добавим вас в класс в течение дня.</p>
        </div>
      ) : (
        <>
          <h1>Запись в класс</h1>
          <p className="enrollment-intro">Оставьте имя, фамилию и Telegram. Добавим вас на сайт в течение дня.</p>
          <form noValidate onSubmit={submit} aria-busy={busy}>
            <fieldset className="teacher-fields" disabled={busy}>
              <label className="teacher-field" htmlFor="enrollment-first-name">
                Имя
                <input ref={firstInput} id="enrollment-first-name" name="given-name" autoComplete="given-name" required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </label>
              <label className="teacher-field" htmlFor="enrollment-last-name">
                Фамилия
                <input ref={lastInput} id="enrollment-last-name" name="family-name" autoComplete="family-name" required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </label>
              <label className="teacher-field" htmlFor="enrollment-telegram">
                Telegram
                <input ref={telegramInput} id="enrollment-telegram" name="telegram" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={64} placeholder="@username" value={telegram} aria-describedby="enrollment-telegram-hint" onChange={(event) => setTelegram(event.target.value)} />
                <span className="teacher-hint" id="enrollment-telegram-hint">Имя пользователя из настроек Telegram, не номер телефона.</span>
              </label>
              <div className="enrollment-honeypot" aria-hidden="true" inert>
                <label htmlFor="enrollment-website">Website</label>
                <input id="enrollment-website" name="website" tabIndex={-1} autoComplete="off" />
              </div>
              <button className="teacher-button primary" type="submit">{busy ? "Отправляем…" : "Отправить заявку"}</button>
            </fieldset>
            <p className="teacher-hint enrollment-privacy">Отправляя заявку, вы передаёте эти данные преподавателю для добавления в класс.</p>
          </form>
        </>
      )}
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </section>
  );
}
