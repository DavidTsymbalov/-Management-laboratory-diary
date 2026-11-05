"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Users, Gift, ChartNoAxesCombined, Plus, Search, LogOut, ChevronDown, Check, KeyRound, ArrowUpRight, ShieldCheck, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { AdministratorsPanel } from "@/components/dashboard/administrators-panel";
import { ConfirmAction, type Confirmation } from "@/components/dashboard/confirm-action";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { TeacherCharts } from "@/components/dashboard/teacher-charts";
import { loadData, rankedStudents, type AppData } from "@/lib/store";
import {
  addCloudStudents, awardCloudAchievement, awardCloudNuts, getCloudRole,
  loadCloudData, manageCloudStudents, signOutCloud, watchCloudData, type StudentInput, type CloudRole
} from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";
import { computeStats } from "@/lib/stats";
import { normalizeStudentName } from "@/lib/student-identity";

type Tab = "class" | "award" | "stats" | "admins";

export function TeacherPanel({ role = "teacher" }: { role?: "teacher" | "admin" }) {
  const router = useRouter();
  const [actor, setActor] = useState<CloudRole | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const addField = useRef<HTMLTextAreaElement>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>("class");
  const [namesText, setNamesText] = useState("");
  const [nutsAmount, setNutsAmount] = useState("1");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [achTitle, setAchTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const locked = useRef(false);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<StudentInput[]>([]);

  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [sort, setSort] = useState("name");

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (locked.current) return;
      try {
        const session = await getCloudRole();
        if (!active) return;
        if (session?.role !== role) { router.replace(`/${role}/`); return; }
        const loaded = await loadCloudData();
        if (active && !locked.current) {
          setActor(session); setData(loaded); setSyncError(null);
          setSelectedIds((ids) => ids.filter((id) => loaded.students.some((student) => student.id === id)));
        }
      } catch (error) { if (active) setSyncError(cloudError(error)); }
    }
    void refresh();
    const stop = watchCloudData(refresh);
    return () => { active = false; stop(); };
  }, [router, role, attempt]);

  useEffect(() => { if (showAdd && tab === "class") addField.current?.focus(); }, [showAdd, tab]);

  const ranked = useMemo(
    () => (data ? rankedStudents(data.students) : []),
    [data],
  );
  const stats = useMemo(() => computeStats(data?.students ?? []), [data]);

  async function runAction(action: () => Promise<string>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError(null); setMessage(null);
    let saved = false;
    try {
      const message = await action();
      saved = true;
      setMessage(message);
      setData(await loadCloudData());
    } catch (error) {
      setError(`${saved ? "Изменения сохранены, но не удалось обновить список. " : ""}${cloudError(error)}`);
      // A batch may have partly completed; reconcile with the database before retrying.
      try { setData(await loadCloudData()); } catch { /* Keep the last view and the error above. */ }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function chooseTab(next: Tab) {
    if (busy || adminBusy || (next === "admins" && role !== "teacher")) return;
    setTab(next);
    setQuery("");
    setError(null); setMessage(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function toggleStudent(id: string) {
    if (!selectedIds.includes(id) && selectedIds.length >= 100) { setError("За один раз можно выбрать до 100 учеников."); return; }
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function randomPassword() {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function createAccounts(students: StudentInput[]) {
    if (students.length < 1 || students.length > 30) throw new Error("Добавляйте от 1 до 30 учеников за раз.");
    const names = students.map((student) => normalizeStudentName(student.name));
    if (new Set(names).size !== names.length) throw new Error("В списке повторяются имена. Для полных тёзок добавьте различающий суффикс — он будет частью логина.");
    const result = await addCloudStudents(students);
    setCredentials(students.filter((s) => result.created.includes(s.name)));
    if (!result.created.length && result.errors.length) throw new Error(result.errors.join(" "));
    setNamesText(students.filter((student) => !result.created.includes(student.name)).map((student) => `${student.name} | ${student.password}`).join("\n"));
    if (result.errors.length) setError(result.errors.join(" "));
    return `Аккаунтов создано: ${result.created.length}. Передайте ученикам данные для входа.`;
  }

  function addMany() {
    void runAction(async () => {
      const students = namesText.split("\n").filter((line) => line.trim()).map((line) => {
        const separator = line.indexOf("|");
        const name = (separator < 0 ? line : line.slice(0, separator)).trim();
        const password = separator < 0 ? "" : line.slice(separator + 1).trim();
        return { name: name.replace(/\s+/gu, " "), password: password || randomPassword() };
      });
      if (students.some((s) => !s.name || s.name.length > 200 || s.password.length < 8 || s.password.length > 128)) throw new Error("Укажите ФИО и пароль минимум из 8 символов, либо оставьте пароль пустым.");
      return createAccounts(students);
    });
  }

  function importLocal() {
    const local = loadData();
    if (!local.students.length) { setError("На этом устройстве нет старых учеников для переноса."); return; }
    setConfirmation({ title: "Перенести учеников?", description: `В общую базу будут добавлены ученики с этого устройства: ${local.students.length}. Для коротких паролей создадим новые.`, label: "Перенести", onConfirm: () => {
      void runAction(() => createAccounts(local.students.map((s) => ({
        ...s, name: s.name.trim().replace(/\s+/gu, " "),
        password: s.password.length >= 8 ? s.password : randomPassword(),
      }))));
    } });
  }

  function deleteStudent(id: string) {
    void runAction(async () => {
      await manageCloudStudents({ action: "delete", id });
      setSelectedIds((ids) => ids.filter((item) => item !== id));
      return "Ученик удалён.";
    });
  }

  function changePassword(id: string) {
    void runAction(async () => {
      const password = passwords[id] ?? "";
      if (password.length < 8 || password.length > 128) throw new Error("Пароль должен содержать минимум 8 символов.");
      await manageCloudStudents({ action: "password", id, password });
      setPasswords((prev) => ({ ...prev, [id]: "" }));
      return "Новый пароль сохранён.";
    });
  }

  function awardNuts() {
    if (!data || selectedIds.length === 0) {
      setMessage("Выберите учеников.");
      return;
    }
    const amount = Number(nutsAmount);
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1000000) {
      setError("Укажите целое число от −1 000 000 до 1 000 000, кроме нуля.");
      return;
    }
    const award = () => { void runAction(async () => {
      await awardCloudNuts(selectedIds, amount);
      return `${amount > 0 ? "Начислено" : "Списано"}: ${Math.abs(amount).toLocaleString("ru-RU")} баллов каждому. Учеников: ${selectedIds.length}.`;
    }); };
    if (amount < 0) setConfirmation({ title: "Уменьшить баланс?", description: `У каждого выбранного ученика (${selectedIds.length}) будет списано ${Math.abs(amount).toLocaleString("ru-RU")} баллов. Баланс не станет отрицательным.`, label: "Списать баллы", destructive: true, onConfirm: award });
    else award();
  }

  function awardAch() {
    if (!data || selectedIds.length === 0 || !achTitle.trim()) {
      setMessage("Выберите учеников и напишите ачивку.");
      return;
    }
    void runAction(async () => {
      await awardCloudAchievement(selectedIds, achTitle);
      setAchTitle("");
      return `Достижение «${achTitle.trim()}» выдано. Учеников: ${selectedIds.length}.`;
    });
  }

  if (!data) {
    if (syncError) return <div className="student-error">
      <h1>Не удалось открыть класс</h1>
      <p role="alert">{syncError}</p>
      <div className="student-error-actions"><Button onClick={() => setAttempt((value) => value + 1)}>Повторить</Button>
      <Button href={`/${role}/`}>Ко входу</Button></div>
    </div>;
    return <div className="workspace-loading" role="status">
      <span className="loading-dot" />
      <h1>Открываем ваш класс</h1>
      <p>Загружаем учеников и результаты…</p>
    </div>;
  }

  const visible = data.students.filter((s) => s.name.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"))).sort((a, b) => sort === "points" ? b.nuts - a.nuts : a.name.localeCompare(b.name, "ru"));
  const tabs: {id: Tab; label: string; icon: typeof Users}[] = [{ id: "class", label: "Мой класс", icon: Users }, { id: "award", label: "Наградить", icon: Gift }, { id: "stats", label: "Статистика", icon: ChartNoAxesCombined }, ...(role === "teacher" ? [{id: "admins" as const, label: "Администраторы", icon: ShieldCheck}] : [])];

  const roleLabel = role === "teacher" ? "Преподаватель" : "Администратор";
  const displayName = actor?.name || roleLabel;
  return <><div className="dashboard-layout">
    <aside className="dashboard-sidebar">
      <div className="profile-block">
        <div className="avatar" aria-hidden="true">{displayName.split(" ").slice(0, 2).map((part) => part[0]).join("")}</div>
        <div>
          <strong>{displayName}</strong>
          <p>{roleLabel}</p>
        </div>
      </div>
      <p className="eyebrow sidebar-label">Рабочее пространство</p>
      <nav aria-label="Разделы кабинета" className="dashboard-nav">{tabs.map(({ id, label, icon: Icon }) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => chooseTab(id)} disabled={busy || adminBusy}>
        <Icon size={19} />
        <span>{label}</span>{id === "class" && <small>{data.students.length}</small>}</button>)}</nav>
      <div className="sidebar-note">
        <span className="status-dot" /> Общая база класса<p>Баллы и достижения доступны ученикам в их кабинетах.</p>
      </div>
      <button className="quiet-action sidebar-logout" disabled={busy || adminBusy} onClick={async () => { try { await signOutCloud(); router.push(`/${role}/`); } catch (e) { setSyncError(cloudError(e)); } }}>
        <LogOut size={17} /> Выйти из аккаунта</button>
    </aside>
    <div className="dashboard-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{role === "teacher" ? "Кабинет преподавателя" : "Кабинет администратора"}</p>
          <h1>{tab === "class" ? "Мой класс" : tab === "award" ? "Выдать награду" : tab === "admins" ? "Администраторы" : "Класс в цифрах"}<span className="heading-dot">.</span>
          </h1>
          <p className="page-description">{tab === "class" ? "Ученики, их достижения и доступ к дневнику — в одном месте." : tab === "award" ? "Выберите учеников и выдайте баллы или новое достижение." : tab === "admins" ? "Делегируйте ведение класса людям, которым доверяете." : "Распределение баллов и достижений в классе."}</p>
        </div>{tab === "class" && <button className="action primary" disabled={busy} onClick={() => setShowAdd(!showAdd)} aria-expanded={showAdd} aria-controls="add-students-panel">
          <Plus size={18} /> Добавить учеников</button>}</header>
      {syncError && <div className="notice danger" role="alert"><span>{syncError} Показаны последние загруженные данные.</span><button className="quiet-action" disabled={busy} onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={14} />Обновить</button></div>}
      {tab === "admins" && role === "teacher" ? <AdministratorsPanel onBusyChange={setAdminBusy} /> : <>
      <div aria-live="polite">{message && <p className="notice success" role="status">
        <Check size={18} />{message}<button onClick={() => setMessage(null)} aria-label="Закрыть уведомление">×</button>
      </p>}{error && <p className="notice danger" role="alert">{error}</p>}{busy && <p className="notice" role="status">Сохраняем изменения…</p>}</div>
      <fieldset disabled={busy} className="workspace-fields" aria-busy={busy}>
        {credentials.length > 0 && <section className="panel credentials-panel">
          <h2>Данные для входа готовы</h2>
          <p className="muted">Сохраните список. Передайте каждому ученику только его логин и пароль.</p>
          <textarea aria-label="Новые данные входа" readOnly rows={Math.min(credentials.length + 1, 10)} value={credentials.map((s) => `${s.name} | ${s.password}`).join("\n")} />
          <div className="credential-actions"><button className="action secondary" onClick={async () => { try { await navigator.clipboard.writeText(credentials.map((s) => `${s.name} | ${s.password}`).join("\n")); setMessage("Данные для входа скопированы."); } catch { setError("Выделите данные в поле и скопируйте их вручную."); } }}><Copy size={16} />Скопировать</button><button className="quiet-action" onClick={() => setCredentials([])}>Скрыть пароли</button></div>
        </section>}
        {tab === "class" && <>
          {showAdd && <section id="add-students-panel" className="panel add-panel">
            <div>
              <p className="eyebrow">Пополнение класса</p>
              <h2>Новые ученики</h2>
              <p className="muted">Каждое имя — с новой строки. Пароли создадим автоматически. Можно задать свой: ФИО | пароль (от 8 символов).</p>
            </div>
            <div>
              <label htmlFor="new-students">Имена и фамилии</label>
              <textarea ref={addField} id="new-students" rows={4} value={namesText} onChange={(e) => setNamesText(e.target.value)} placeholder={"Иванов Иван\nПетрова Анна"} />
              <div className="action-row">
                <button className="action primary" disabled={!namesText.trim()} onClick={addMany}>Создать аккаунты</button>
                <button className="action secondary" onClick={() => setShowAdd(false)}>Отмена</button>
              </div>
              <button className="quiet-action import-action" onClick={importLocal}>Перенести старый класс с этого устройства ↗</button>
            </div>
          </section>}
          <StatsGrid stats={stats} />
          <section className="panel class-panel">
            <div className="section-heading">
              <div>
                <h2>Ученики <span className="count-tag">{data.students.length}</span>
                </h2>
                <p className="muted">Управляйте аккаунтами и следите за результатами.</p>
              </div>
              <button className="quiet-action" onClick={() => chooseTab("award")}>Выдать награду <ArrowUpRight size={16} />
              </button>
            </div>
            <div className="list-toolbar">
              <div className="search-field">
                <Search size={18} />
                <input aria-label="Найти ученика" placeholder="Найти по имени или фамилии" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select aria-label="Сортировка учеников" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="name">По имени</option>
                <option value="points">По баллам</option>
              </select>
            </div>
            <div className="student-table-head" aria-hidden="true">
              <span>Ученик</span>
              <span>Баллы</span>
              <span>Достижения</span>
              <span>Доступ</span>
            </div>
            <ul className="student-list">{visible.map((student) => <li key={student.id} className="student-entry">
              <div className="student-row">
                <div className="student-identity">
                  <div className="avatar small" aria-hidden="true">{student.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}</div>
                  <div>
                    <strong>{student.name}</strong>
                    <span className="student-meta">Ученик</span>
                  </div>
                </div>
                <span className="points-value">{student.nuts.toLocaleString("ru-RU")}<small>баллы</small>
                </span>
                <span className="achievement-value">{student.achievements.length}<small>награды</small>
                </span>
                <details className="student-settings">
                  <summary aria-label={`Доступ: ${student.name}`}>
                    <KeyRound size={16} />
                    <span>Доступ</span>
                    <ChevronDown size={14} />
                  </summary>
                  <form className="student-settings-body" onSubmit={(event) => { event.preventDefault(); changePassword(student.id); }}>
                    <label htmlFor={`pass-${student.id}`}>Новый пароль</label>
                    <PasswordInput id={`pass-${student.id}`} maxLength={128} value={passwords[student.id] ?? ""} onChange={(e) => setPasswords((prev) => ({ ...prev, [student.id]: e.target.value }))} placeholder="От 8 символов" autoComplete="new-password" />
                    <button type="submit" className="action secondary" disabled={(passwords[student.id] ?? "").length < 8}>Сохранить пароль</button>
                    <button type="button" className="quiet-action danger-text" onClick={() => setConfirmation({ title: "Удалить ученика?", description: `Аккаунт ${student.name}, баллы и достижения будут удалены. Это действие нельзя отменить.`, label: "Удалить ученика", destructive: true, onConfirm: () => deleteStudent(student.id) })}>
                      <Trash2 size={16} />Удалить ученика</button>
                  </form>
                </details>
              </div>
            </li>)}</ul>
            {!visible.length && <div className="empty-state">
              <Users size={32} />
              <h3>{query ? "Никого не нашли" : "Начните с первого ученика"}</h3>
              <p>{query ? "Попробуйте другую часть имени или фамилии." : "Создайте аккаунты, чтобы выдавать баллы и отмечать достижения."}</p>{!query && <button className="action primary" onClick={() => setShowAdd(true)}>Добавить учеников</button>}</div>}
            <div className="list-footer">Показано: {visible.length} из {data.students.length}<span>Пароли учеников скрыты</span>
            </div>
          </section>
        </>}
        {tab === "award" && <div className="award-layout">
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Шаг 01</p>
                <h2>Выберите учеников</h2>
              </div>
              <span className="count-tag">{selectedIds.length} выбрано</span>
            </div>
            <div className="search-field">
              <Search size={18} />
              <input aria-label="Поиск получателей" placeholder="Поиск по имени" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="selection-tools">
              <button className="quiet-action" disabled={!visible.length} onClick={() => { const next = Array.from(new Set([...selectedIds, ...visible.map((s) => s.id)])); if (next.length > 100) { setError("За один раз можно выбрать до 100 учеников. Уточните поиск."); return; } setSelectedIds(next); }}>Выбрать найденных</button>
              <button className="quiet-action" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>Снять выбор</button>
            </div>
            <div className="recipient-list">{visible.map((student) => <label key={student.id} className="recipient" data-selected={selectedIds.includes(student.id)}>
              <input type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
              <span>{student.name}</span>
              <small>{student.nuts.toLocaleString("ru-RU")} б.</small>
            </label>)}{!visible.length && <p className="muted">Ученики не найдены.</p>}</div>
          </section>
          <div className="award-actions">
            <section className="panel">
              <p className="eyebrow">Шаг 02 / баллы</p>
              <h2>За старание и результат</h2>
              <p className="muted">Баллы получит каждый выбранный ученик.</p>
              <Label htmlFor="nuts">Количество баллов</Label>
              <Input id="nuts" type="number" step="1" min={-1000000} max={1000000} value={nutsAmount} onChange={(e) => setNutsAmount(e.target.value)} />
              <div className="quick-amounts">{[1, 5, 10, 25].map((n) => <button className="action secondary" key={n} aria-pressed={nutsAmount === String(n)} onClick={() => setNutsAmount(String(n))}>+{n}</button>)}</div>
              <button className="action primary full-width" disabled={!selectedIds.length || !Number.isInteger(Number(nutsAmount)) || Number(nutsAmount) === 0 || Math.abs(Number(nutsAmount)) > 1000000} onClick={awardNuts}>{Number(nutsAmount) < 0 ? "Списать баллы" : "Выдать баллы"} · {selectedIds.length} чел.</button>
              <p className="field-hint">Отрицательное число уменьшит баланс.</p>
            </section>
            <section className="panel">
              <p className="eyebrow">Или / достижение</p>
              <h2>Отметьте особенный успех</h2>
              <Label htmlFor="ach">Название достижения</Label>
              <Input id="ach" maxLength={300} value={achTitle} onChange={(e) => setAchTitle(e.target.value)} placeholder="Например, отличная командная работа" />
              <button className="action secondary full-width" disabled={!selectedIds.length || !achTitle.trim()} onClick={awardAch}>
                <Gift size={17} />Выдать достижение</button>
            </section>
          </div>
        </div>}
        {tab === "stats" && <>
          <StatsGrid stats={stats} />
          <TeacherCharts students={data.students} />
          <section className="panel">
            <div className="section-heading">
              <h2>Рейтинг класса</h2>
              <span className="muted">По количеству баллов</span>
            </div>
            <ol className="ranking-list">{ranked.map((student, index) => <li key={student.id}>
              <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
              <strong>{student.name}</strong>
              <span className="points-value">{student.nuts.toLocaleString("ru-RU")}<small>баллы</small>
              </span>
            </li>)}</ol>{!ranked.length && <p className="muted">Здесь появятся результаты учеников.</p>}</section></>}
      </fieldset>
      </>}
    </div>
  </div><ConfirmAction confirmation={confirmation} onCancel={() => setConfirmation(null)} /></>;
}
