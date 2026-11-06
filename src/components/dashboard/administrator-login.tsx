"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
import { getCloudRole, signInCloud } from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";
export function AdministratorLogin() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  useEffect(() => {
    let active = true;
    void getCloudRole()
      .then((role) => {
        if (!active) return;
        if (role?.role === "admin") router.replace("/admin/dashboard/");
        else setReady(true);
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
  }, [router]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !ready) return;
    locked.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      if (!login.trim() || !password)
        throw new Error(
          "Введите логин и пароль ученика, которому назначены права администратора.",
        );
      await signInCloud(login, password, "admin");
      router.push("/admin/dashboard/");
    } catch (error) {
      setFeedback({ type: "error", message: cloudError(error) });
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div
      className="administrator-login teacher-workspace"
      onChangeCapture={() => setFeedback(null)}
    >
      <h1>Вход администратора</h1>
      <p className="teacher-hint">
        Используйте свой ученический логин и пароль. Доступ назначает
        преподаватель.
      </p>
      <form
        noValidate
        className="teacher-login-form"
        onSubmit={(event) => void submit(event)}
        aria-busy={busy || !ready}
      >
        <div className="teacher-field">
          <label htmlFor="admin-username">Логин ученика</label>
          <Input
            id="admin-username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            disabled={busy || !ready}
          />
        </div>
        <div className="teacher-field">
          <label htmlFor="admin-password">Пароль</label>
          <PasswordInput
            id="admin-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy || !ready}
          />
        </div>
        <button
          type="submit"
          className="teacher-button primary"
          disabled={busy || !ready}
        >
          {busy ? "Входим…" : !ready ? "Проверяем вход…" : "Войти"}
        </button>
      </form>
      <Link className="teacher-button subtle" href="/student/">
        Войти в личный дневник
      </Link>
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </div>
  );
}
