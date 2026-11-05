"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { getCloudRole, signInCloud, type CloudRole } from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";

const copy = {
  student: { title: "Вход в дневник", description: "Твои баллы, место в классе и достижения.", label: "Имя и фамилия / логин", placeholder: "Как записал преподаватель", help: "Логин и пароль выдаёт преподаватель или администратор класса. Если не получается войти, обратись к ним." },
  admin: { title: "Вход администратора", description: "Ученики, награды и результаты класса.", label: "Логин", placeholder: "Ваш логин", help: "Аккаунт администратора создаёт преподаватель. Для восстановления доступа обратитесь к нему." },
  teacher: { title: "Вход преподавателя", description: "Управление классом и доступом администраторов.", label: "Логин", placeholder: "Ваш логин", help: "Используйте данные учётной записи преподавателя. Только преподаватель может назначать администраторов." },
};

export function AuthForm({ role }: { role: CloudRole["role"] }) {
  const router = useRouter();
  const details = copy[role];
  const [ready, setReady] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let active = true;
    void getCloudRole().then((session) => {
      if (!active) return;
      if (session?.role === role) router.replace(`/${role}/dashboard/`);
      else setReady(true);
    }).catch((e) => { if (active) { setError(cloudError(e)); setReady(true); } });
    return () => { active = false; };
  }, [role, router]);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || !ready) return;
    if (!login.trim()) { setError("Введите логин."); return; }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await signInCloud(login.trim(), password, role);
      router.push(`/${role}/dashboard/`);
    } catch (e) {
      setError(cloudError(e));
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-intro" aria-label="О дневнике">
        <p className="eyebrow">Учебный дневник</p>
        <div className="auth-editorial-title" aria-hidden>Учиться.<br />{" "}Пробовать.<br /><span>Расти.</span></div>
        <p className="auth-lead">Результаты занятий складываются в&nbsp;личную историю. Здесь она всегда под&nbsp;рукой.</p>
        <div className="journal-index" aria-hidden>
          <span><small>01</small> Баллы за работу</span>
          <span><small>02</small> Личные достижения</span>
          <span><small>03</small> Прогресс класса</span>
        </div>
        <div className="auth-edition"><span>Management Laboratory</span><span>Дневник класса ↗</span></div>
      </section>
      <section className="auth-form-panel" aria-labelledby="auth-title">
        <nav className="role-switch" aria-label="Выберите роль">
          <Link href="/student/" aria-current={role === "student" ? "page" : undefined}>Ученик</Link>
          <Link href="/admin/" aria-current={role === "admin" ? "page" : undefined}>Администратор</Link>
        </nav>
        <div className="auth-form-heading">
          <p className="eyebrow">{role === "teacher" ? "Для преподавателя" : "С возвращением"}</p>
          <h1 id="auth-title">{details.title}</h1>
          <p className="muted">{details.description}</p>
        </div>
        <form onSubmit={submit} className="auth-form" aria-busy={!ready || busy}>
          <div className="field-stack">
            <label htmlFor="login">{details.label}</label>
            <Input id="login" name="username" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={details.placeholder} maxLength={200} required disabled={busy || !ready} aria-describedby={error ? "auth-error" : undefined} />
          </div>
          <div className="field-stack">
            <label htmlFor="password">Пароль</label>
            <PasswordInput id="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Введите пароль" maxLength={128} required disabled={busy || !ready} aria-describedby={error ? "auth-error" : undefined} />
          </div>
          {error && <p ref={errorRef} id="auth-error" role="alert" tabIndex={-1} className="notice danger">{error}</p>}
          <button className="action primary full-width" disabled={busy || !ready} type="submit">
            {!ready ? "Проверяем вход…" : busy ? "Входим…" : "Войти"}
            {busy || !ready ? <LoaderCircle size={18} className="is-spinning" aria-hidden /> : <ArrowRight size={18} aria-hidden />}
          </button>
        </form>
        <p className="auth-help"><LockKeyhole size={16} aria-hidden />{details.help}</p>
        <div className="auth-teacher-link">{role === "teacher" ? <Link href="/student/">Вернуться ко входу ученика <ArrowUpRight size={14} aria-hidden /></Link> : <Link href="/teacher/">Вход для преподавателя <ArrowUpRight size={14} aria-hidden /></Link>}</div>
      </section>
    </div>
  );
}
