"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Copy, KeyRound, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { ConfirmAction, type Confirmation } from "@/components/dashboard/confirm-action";
import { createCloudAdministrator, loadCloudAdministrators, manageCloudAdministrators, watchCloudData, type CloudAdministrator } from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";

const LOGIN_PATTERN = /^[\p{L}\p{N}._-]{3,80}$/u;

export function AdministratorsPanel({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const [accounts, setAccounts] = useState<CloudAdministrator[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<{ login: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const locked = useRef(false);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (locked.current) return;
      try {
        const rows = await loadCloudAdministrators();
        if (active && !locked.current) { setAccounts(rows); setError(null); }
      } catch (error) { if (active) setError(cloudError(error)); }
    }
    void refresh();
    const stop = watchCloudData(refresh);
    return () => { active = false; stop(); };
  }, [attempt]);

  async function runAction(action: () => Promise<string>) {
    if (locked.current) return;
    locked.current = true;
    onBusyChange?.(true);
    setBusy(true); setError(null); setMessage(null);
    let saved = false;
    try {
      const result = await action();
      saved = true;
      setMessage(result);
      setAccounts(await loadCloudAdministrators());
    } catch (error) {
      setError(`${saved ? "Изменения сохранены, но список не обновился. " : ""}${cloudError(error)}`);
    } finally { locked.current = false; setBusy(false); onBusyChange?.(false); }
  }

  function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction(async () => {
      const cleanName = name.trim().replace(/\s+/gu, " ");
      const cleanLogin = login.normalize("NFKC").trim().toLocaleLowerCase("ru-RU");
      if (!cleanName || cleanName.length > 200) throw new Error("Укажите имя до 200 символов.");
      if (!LOGIN_PATTERN.test(cleanLogin)) throw new Error("Логин: от 3 до 80 букв или цифр. Допустимы точка, дефис и подчёркивание.");
      if (password.length < 8 || password.length > 128) throw new Error("Пароль должен содержать от 8 до 128 символов.");
      const account = await createCloudAdministrator({ name: cleanName, login: cleanLogin, password });
      setCredentials({ login: account.login, password });
      setName(""); setLogin(""); setPassword(""); setShowForm(false);
      return `Доступ создан: ${account.name}.`;
    });
  }

  function resetPassword(account: CloudAdministrator) {
    void runAction(async () => {
      const nextPassword = passwords[account.id] ?? "";
      if (nextPassword.length < 8 || nextPassword.length > 128) throw new Error("Пароль должен содержать от 8 до 128 символов.");
      await manageCloudAdministrators({ action: "password", id: account.id, password: nextPassword });
      setPasswords((current) => ({ ...current, [account.id]: "" }));
      return `Новый пароль сохранён: ${account.name}.`;
    });
  }

  async function copyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(`Логин: ${credentials.login}\nПароль: ${credentials.password}`);
      setMessage("Логин и пароль скопированы.");
    } catch { setError("Не удалось скопировать автоматически. Выделите и скопируйте данные из поля."); }
  }

  return <>
    <div className="workspace-notices" aria-live="polite">
      {message && <p className="notice success" role="status"><Check size={18} aria-hidden="true" />{message}<button type="button" aria-label="Закрыть уведомление" onClick={() => setMessage(null)}><X size={16} /></button></p>}
      {error && <div className="notice danger" role="alert"><span>{error}</span><button type="button" className="quiet-action" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>Обновить список</button></div>}
      {busy && <p className="notice" role="status">Сохраняем изменения…</p>}
    </div>
    <fieldset className="workspace-fields" disabled={busy} aria-busy={busy}>
      {credentials && <section className="panel credentials-panel">
        <h2>Данные для входа</h2>
        <p className="muted">Передайте их администратору. Пароль показывается только сейчас.</p>
        <textarea readOnly rows={2} aria-label="Логин и пароль администратора" value={`Логин: ${credentials.login}\nПароль: ${credentials.password}`} />
        <div className="credential-actions"><button type="button" className="action secondary" onClick={() => void copyCredentials()}><Copy size={16} />Скопировать</button><button type="button" className="quiet-action" onClick={() => setCredentials(null)}>Скрыть данные</button></div>
      </section>}
      <section className="panel admin-panel">
        <div className="section-heading"><div><h2>Аккаунты {accounts && <span className="count-tag">{accounts.length}</span>}</h2></div>
          <button type="button" className="action primary" aria-expanded={showForm} aria-controls="admin-create-form" onClick={() => setShowForm((value) => !value)}><Plus size={18} />Добавить администратора</button></div>
        {showForm && <form id="admin-create-form" className="admin-form" onSubmit={createAccount}>
          <h3>Новый администратор</h3>
          <div className="admin-form-grid">
            <div className="field-stack"><label htmlFor="admin-name">Имя и фамилия</label><Input id="admin-name" name="display-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required autoComplete="off" placeholder="Как обращаться к администратору" /></div>
            <div className="field-stack"><label htmlFor="admin-login">Логин</label><Input id="admin-login" name="username" value={login} onChange={(event) => setLogin(event.target.value)} minLength={3} maxLength={80} required autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="admin-login-hint" placeholder="Например, manager" /></div>
            <div className="field-stack"><label htmlFor="admin-password">Пароль</label><PasswordInput id="admin-password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} required autoComplete="new-password" placeholder="Не менее 8 символов" /></div>
          </div>
          <p id="admin-login-hint" className="field-hint">Логин — от 3 символов без пробелов. Можно использовать буквы, цифры, точку, дефис и подчёркивание.</p>
          <div className="action-row"><button type="submit" className="action primary">Создать доступ</button><button type="button" className="action secondary" onClick={() => { setShowForm(false); setPassword(""); }}>Отмена</button></div>
        </form>}
        {accounts === null && !error && <p className="muted" role="status">Загружаем администраторов…</p>}
        {accounts?.length === 0 && !showForm && <div className="empty-state"><ShieldCheck size={32} aria-hidden="true" /><h3>Пока нет администраторов</h3></div>}
        {Boolean(accounts?.length) && <ul className="admin-list">{accounts?.map((account) => <li key={account.id} className="admin-account">
          <div className="admin-account-details"><div className="avatar small" aria-hidden="true">{account.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}</div><div><strong>{account.name}</strong><p className="admin-account-meta">Логин: {account.login}</p></div><span className="role-badge">Администратор</span></div>
          <details className="student-settings"><summary aria-label={`Настройки доступа: ${account.name}`}><KeyRound size={16} aria-hidden="true" /><span>Доступ</span><ChevronDown size={14} aria-hidden="true" /></summary>
            <form className="student-settings-body" onSubmit={(event) => { event.preventDefault(); resetPassword(account); }}><label htmlFor={`admin-pass-${account.id}`}>Новый пароль для {account.name}</label><PasswordInput id={`admin-pass-${account.id}`} name="new-password" value={passwords[account.id] ?? ""} onChange={(event) => setPasswords((current) => ({ ...current, [account.id]: event.target.value }))} maxLength={128} autoComplete="new-password" placeholder="Не менее 8 символов" /><button type="submit" className="action secondary" disabled={(passwords[account.id] ?? "").length < 8}>Сохранить пароль</button>
              <button type="button" className="quiet-action danger-text" onClick={() => setConfirmation({ title: "Удалить доступ администратора?", description: `${account.name} больше не сможет войти в кабинет. Ученики и их результаты сохранятся.`, label: "Удалить доступ", destructive: true, onConfirm: () => { void runAction(async () => { await manageCloudAdministrators({ action: "delete", id: account.id }); return `Доступ удалён: ${account.name}.`; }); } })}><Trash2 size={16} />Удалить доступ</button>
            </form></details>
        </li>)}</ul>}
      </section>
    </fieldset>
    <ConfirmAction confirmation={confirmation} onCancel={() => setConfirmation(null)} />
  </>;
}
