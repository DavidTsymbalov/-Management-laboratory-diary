"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCw, Search } from "lucide-react";
import { StaffLogin } from "@/components/dashboard/staff-login";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
import { getCloudRole, signOutCloud, type CloudRole } from "@/lib/cloud-store";
import { enrollmentError, loadEnrollments, type EnrollmentRequest } from "@/lib/enrollment";
import { getSupabase } from "@/lib/supabase";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
});

export function EnrollmentInbox() {
  const [account, setAccount] = useState<CloudRole | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<EnrollmentRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loginRole, setLoginRole] = useState<"teacher" | "csa">("teacher");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setRevision((value) => value + 1);
    };
    // Schedule outside Auth's callback so SDK calls cannot deadlock its auth lock.
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange(() => {
      setAccount(null);
      setItems([]);
      setReady(false);
      clearTimeout(authTimer);
      authTimer = setTimeout(refresh, 0);
    });
    const interval = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(authTimer);
      clearInterval(interval);
      subscription.unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setBusy(true);
      setFailed(false);
      try {
        const role = await getCloudRole();
        if (!active) return;
        setAccount(role);
        if ((role?.role === "teacher" || role?.role === "csa") && !role.requiresMfa) {
          const result = await loadEnrollments(search, offset);
          if (!active) return;
          setItems(result.items);
          setTotal(result.total);
        } else {
          setItems([]);
          setTotal(0);
        }
      } catch (error) {
        if (active) {
          setItems([]);
          setTotal(0);
          setFailed(true);
          setFeedback({ type: "error", message: enrollmentError(error) });
        }
      } finally {
        if (active) {
          setReady(true);
          setBusy(false);
        }
      }
    }
    const timer = setTimeout(() => void load(), search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [search, offset, revision]);

  async function copyTelegram(value: string) {
    try {
      await navigator.clipboard.writeText(`@${value}`);
      setFeedback({ type: "success", message: "Telegram скопирован." });
    } catch {
      setFeedback({ type: "error", message: "Не удалось скопировать. Выделите имя пользователя вручную." });
    }
  }

  const allowed = account && (account.role === "teacher" || account.role === "csa");
  return (
    <section className="enrollment-inbox teacher-workspace">
      {!ready ? (
        <div className="teacher-loading" role="status">Проверяем доступ…</div>
      ) : !allowed || account.requiresMfa ? (
        <div className="enrollment-access">
          <p className="teacher-hint">Заявки доступны только преподавателю и CSA.</p>
          {account && !allowed ? (
            <>
              <h1>Нужен другой аккаунт</h1>
              <button type="button" className="teacher-button" onClick={() => {
                void signOutCloud().catch((error) => setFeedback({ type: "error", message: enrollmentError(error) }));
              }}>Выйти из текущего аккаунта</button>
            </>
          ) : (
            <>
              <div className="enrollment-role-switch" role="group" aria-label="Аккаунт для просмотра заявок">
                <button className="teacher-button" type="button" aria-pressed={loginRole === "teacher"} onClick={() => setLoginRole("teacher")}>Преподаватель</button>
                <button className="teacher-button" type="button" aria-pressed={loginRole === "csa"} onClick={() => setLoginRole("csa")}>CSA</button>
              </div>
              <StaffLogin key={loginRole} role={loginRole} destination="/BaseOOO/" />
            </>
          )}
        </div>
      ) : (
        <>
          <div className="enrollment-inbox-heading">
            <div><h1>Заявки в класс</h1><p className="teacher-hint">Имя, фамилия и Telegram будущих учеников.</p></div>
            <button type="button" className="teacher-button" disabled={busy} onClick={() => { setFeedback(null); setRevision((value) => value + 1); }}><RefreshCw size={16} aria-hidden="true" />Обновить</button>
          </div>
          <div className="enrollment-inbox-toolbar">
            <label className="enrollment-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Найти заявку</span><input type="search" maxLength={100} value={search} placeholder="Имя, фамилия или Telegram" onChange={(event) => { setSearch(event.target.value); setOffset(0); setFeedback(null); }} /></label>
            <p className="teacher-hint" aria-live="polite">{busy ? "Загружаем…" : `Найдено: ${total}`}</p>
          </div>
          <div aria-busy={busy}>
            {items.length ? (
              <table className="enrollment-table">
                <caption className="sr-only">Заявки на добавление в класс. Дата указана по московскому времени.</caption>
                <thead><tr><th scope="col">Имя</th><th scope="col">Фамилия</th><th scope="col">Telegram</th><th scope="col">Отправлено</th></tr></thead>
                <tbody>{items.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Имя">{entry.first_name}</td>
                    <td data-label="Фамилия">{entry.last_name}</td>
                    <td data-label="Telegram"><div className="enrollment-telegram"><a href={`https://t.me/${entry.telegram}`} target="_blank" rel="noopener noreferrer">@{entry.telegram}</a><button type="button" aria-label={`Скопировать Telegram ${entry.telegram}`} onClick={() => void copyTelegram(entry.telegram)}><Copy size={16} aria-hidden="true" /></button></div></td>
                    <td data-label="Отправлено"><time dateTime={entry.created_at}>{dateFormatter.format(new Date(entry.created_at))}</time></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : (
              <p className="teacher-empty" role="status">{busy ? "Загружаем заявки…" : failed ? "Не удалось загрузить заявки. Нажмите «Обновить»." : search ? "Ничего не найдено. Попробуйте другое имя или Telegram." : "Пока нет заявок. Они появятся здесь после заполнения формы."}</p>
            )}
          </div>
          {total > 100 && (
            <div className="enrollment-pagination">
              <button type="button" className="teacher-button" disabled={busy || offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 100))}>Назад</button>
              <span className="teacher-hint">{offset + 1}–{Math.min(offset + 100, total)} из {total}</span>
              <button type="button" className="teacher-button" disabled={busy || offset + 100 >= total} onClick={() => setOffset((value) => value + 100)}>Далее</button>
            </div>
          )}
        </>
      )}
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </section>
  );
}
