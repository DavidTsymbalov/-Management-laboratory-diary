"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  getCloudRole,
  signInCloud,
  signOutCloud,
  type CloudRole,
} from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";
import { PasswordInput } from "@/components/ui/password-input";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
import { MfaForm } from "@/components/dashboard/mfa-form";
export function StaffLogin({ role }: { role: "teacher" | "admin" | "csa" }) {
  const router = useRouter();
  const [login, setLogin] = useState(role === "csa" ? "csa" : "");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState<CloudRole | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  useEffect(() => {
    let active = true;
    void getCloudRole()
      .then((current) => {
        if (!active) return;
        if (current?.role === role) {
          if (current.requiresMfa) setAccount(current);
          else router.replace(`/${role}/dashboard/`);
        }
        setReady(true);
      })
      .catch((error) => {
        if (active) {
          setReady(true);
          setFeedback({ type: "error", message: cloudError(error) });
        }
      });
    return () => {
      active = false;
    };
  }, [role, router]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    setFeedback(null);
    if (!login.trim() || !password) {
      setFeedback({ type: "error", message: "Введите логин и пароль." });
      return;
    }
    locked.current = true;
    setBusy(true);
    try {
      const current = await signInCloud(login, password, role);
      setPassword("");
      if (current?.requiresMfa) setAccount(current);
      else router.push(`/${role}/dashboard/`);
    } catch (error) {
      setFeedback({ type: "error", message: cloudError(error) });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="administrator-login teacher-workspace"
      onChangeCapture={() => setFeedback(null)}
    >
      <h1>
        {role === "csa"
          ? "Вход CSA"
          : role === "teacher"
            ? "Вход преподавателя"
            : "Вход администратора"}
      </h1>
      {account?.requiresMfa ? (
        <>
          <MfaForm
            enrolled={Boolean(account.mfaEnrolled)}
            onVerified={async () => {
              const current = await getCloudRole();
              if (current?.role === role && !current.requiresMfa)
                router.replace(`/${role}/dashboard/`);
              else throw new Error("Не удалось подтвердить доступ.");
            }}
          />
          <button
            type="button"
            className="teacher-button subtle"
            onClick={async () => {
              try {
                await signOutCloud();
                setAccount(null);
              } catch (error) {
                setFeedback({ type: "error", message: cloudError(error) });
              }
            }}
          >
            Другой аккаунт
          </button>
        </>
      ) : (
        <form
          noValidate
          className="teacher-login-form"
          onSubmit={submit}
          aria-busy={busy || !ready}
        >
          <label className="teacher-field" htmlFor="staff-login">
            Логин
            <input
              id="staff-login"
              value={login}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy || !ready}
              onChange={(event) => setLogin(event.target.value)}
            />
          </label>
          <label className="teacher-field" htmlFor="staff-password">
            Пароль
            <PasswordInput
              id="staff-password"
              value={password}
              autoComplete="current-password"
              disabled={busy || !ready}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="teacher-button primary"
            disabled={busy || !ready}
          >
            {busy ? "Входим…" : !ready ? "Проверяем вход…" : "Войти"}
          </button>
        </form>
      )}
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </section>
  );
}
