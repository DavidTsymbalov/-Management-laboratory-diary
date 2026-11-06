"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { getCloudRole, signInCloud, type CloudRole } from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";
import { publicUrl } from "@/lib/public-url";

const copy = {
  student: { title: "Вход ученика", label: "Логин", placeholder: "Имя и фамилия…", help: "Введи имя так, как его записали при создании аккаунта. Логин и пароль можно уточнить у преподавателя или администратора." },
  admin: { title: "Вход администратора", label: "Логин", placeholder: "Ваш логин…", help: "Аккаунт создаёт преподаватель. Для восстановления доступа обратитесь к нему." },
  teacher: { title: "Вход преподавателя", label: "Логин", placeholder: "Ваш логин…", help: "Используйте логин и пароль учётной записи преподавателя." },
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
      <div className="auth-intro" aria-hidden="true">
        <Image src={publicUrl("/media/showreel-poster.jpg")} fill sizes="(max-width: 760px) 0px, 50vw" alt="" className="auth-poster" />
        <div className="auth-identity"><Image src={publicUrl("/brand/hawk-owl-icon.png")} width={51} height={68} alt="" /><span translate="no">Management<br />Laboratory</span></div>
        <span className="auth-edition">Дневник класса</span>
      </div>
      <section className="auth-form-panel" aria-labelledby="auth-title">
        <nav className="role-switch" aria-label="Выберите роль">
          <Link href="/student/" aria-current={role === "student" ? "page" : undefined}>Ученик</Link>
          <Link href="/admin/" aria-current={role === "admin" ? "page" : undefined}>Администратор</Link>
          <Link href="/teacher/" aria-current={role === "teacher" ? "page" : undefined}>Преподаватель</Link>
        </nav>
        <div className="auth-form-heading">
          <h1 id="auth-title">{details.title}</h1>
        </div>
        <form onSubmit={submit} className="auth-form" aria-busy={!ready || busy}>
          <div className="field-stack">
            <label htmlFor="login">{details.label}</label>
            <Input id="login" name="username" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={details.placeholder} maxLength={200} required disabled={busy || !ready} aria-invalid={error ? true : undefined} aria-describedby={error ? "auth-error" : undefined} />
          </div>
          <div className="field-stack">
            <label htmlFor="password">Пароль</label>
            <PasswordInput id="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Введите пароль…" maxLength={128} required disabled={busy || !ready} aria-invalid={error ? true : undefined} aria-describedby={error ? "auth-error" : undefined} />
          </div>
          {error && <p ref={errorRef} id="auth-error" role="alert" tabIndex={-1} className="notice danger">{error}</p>}
          <button className="action primary full-width" disabled={busy || !ready} type="submit">
            {!ready ? "Проверяем вход…" : busy ? "Входим…" : "Войти"}
            {busy || !ready ? <LoaderCircle size={18} className="is-spinning" aria-hidden /> : <ArrowRight size={18} aria-hidden />}
          </button>
        </form>
        <details className="auth-help"><summary>Не получается войти?<ChevronDown size={14} aria-hidden /></summary><p>{details.help}</p></details>
      </section>
    </div>
  );
}
