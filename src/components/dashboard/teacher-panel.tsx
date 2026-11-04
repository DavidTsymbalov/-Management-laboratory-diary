"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { TeacherCharts } from "@/components/dashboard/teacher-charts";
import { ScrambleText } from "@/components/motion/scramble-text";
import { NutsBadge } from "@/components/ui/nuts-badge";
import { AchievementBadge } from "@/components/ui/achievement-badge";
import { loadData, rankedStudents, type AppData } from "@/lib/store";
import { addCloudStudents, awardCloudAchievement, awardCloudNuts, getCloudRole,
  loadCloudData, manageCloudStudents, signOutCloud, watchCloudData, type StudentInput } from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";
import { computeStats } from "@/lib/stats";
import { pixelNavigate } from "@/lib/pixel-nav";
import { cn } from "@/lib/cn";

type Tab = "class" | "award" | "stats";

export function TeacherPanel() {
  const router = useRouter();
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>("class");
  const [namesText, setNamesText] = useState("");
  const [nutsAmount, setNutsAmount] = useState("1");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [achTitle, setAchTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<StudentInput[]>([]);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (locked.current) return;
      try {
        const role = await getCloudRole();
        if (!active) return;
        if (role?.role !== "teacher") { router.replace("/teacher/"); return; }
        const loaded = await loadCloudData();
        if (active && !locked.current) { setData(loaded); setError(null); }
      } catch (error) { if (active) setError(cloudError(error)); }
    }
    void refresh();
    const stop = watchCloudData(refresh);
    return () => { active = false; stop(); };
  }, [router]);

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

  function toggleStudent(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function randomPassword() {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function createAccounts(students: StudentInput[]) {
    if (students.length < 1 || students.length > 30) throw new Error("Добавляйте от 1 до 30 учеников за раз.");
    const result = await addCloudStudents(students);
    setCredentials(students.filter((s) => result.created.includes(s.name)));
    if (!result.errors.length) setNamesText("");
    return `Добавлено: ${result.created.length}.${result.errors.length ? ` ${result.errors.join(" ")}` : ""}`;
  }

  function addMany() {
    void runAction(async () => {
      const students = namesText.split("\n").filter((line) => line.trim()).map((line) => {
        const [name, password] = line.split("|").map((part) => part.trim());
        return { name: name.replace(/\s+/gu, " "), password: password || randomPassword() };
      });
      if (students.some((s) => !s.name || s.password.length < 8)) throw new Error("Укажите ФИО и пароль минимум из 8 символов, либо оставьте пароль пустым.");
      return createAccounts(students);
    });
  }

  function importLocal() {
    const local = loadData();
    if (!local.students.length) { setError("На этом устройстве нет старых учеников для переноса."); return; }
    if (!confirm(`Перенести ${local.students.length} учеников с этого устройства в общую базу? Для коротких паролей будут созданы новые.`)) return;
    void runAction(() => createAccounts(local.students.map((s) => ({
      ...s, name: s.name.trim().replace(/\s+/gu, " "),
      password: s.password.length >= 8 ? s.password : randomPassword(),
    }))));
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
      if (password.length < 8) throw new Error("Пароль должен содержать минимум 8 символов.");
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
    const amount = Math.trunc(Number(nutsAmount));
    if (!Number.isFinite(amount) || amount === 0) {
      setMessage("Укажите число баллов.");
      return;
    }
    void runAction(async () => {
      await awardCloudNuts(selectedIds, amount);
      return `Баллы выданы: ${amount > 0 ? "+" : ""}${amount} × ${selectedIds.length}`;
    });
  }

  function awardAch() {
    if (!data || selectedIds.length === 0 || !achTitle.trim()) {
      setMessage("Выберите учеников и напишите ачивку.");
      return;
    }
    void runAction(async () => {
      await awardCloudAchievement(selectedIds, achTitle);
      setAchTitle("");
      return `Ачивка выдана × ${selectedIds.length}`;
    });
  }

  if (!data) {
    if (error) return <div role="alert" className="space-y-3"><p>{error}</p><Button onClick={() => window.location.reload()}>Повторить</Button><Button href="/teacher/">Ко входу</Button></div>;
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "class", label: "Класс" },
    { id: "award", label: "Выдача" },
    { id: "stats", label: "Графики" },
  ];

  return (
    <fieldset disabled={busy} className="min-w-0 space-y-8 border-0 p-0">
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {busy ? <p role="status" className="text-sm text-muted-foreground">Сохраняем изменения…</p> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Учитель · Андрей Лякин
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Кабинет
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Учеников в классе: {data.students.length}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!confirm("Удалить весь класс и аккаунты учеников из общей базы?")) return;
              void runAction(async () => {
                for (const student of data.students) await manageCloudStudents({ action: "delete", id: student.id });
                setSelectedIds([]);
                return "Класс очищен.";
              });
            }}
          >
            Сброс
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => pixelNavigate("/")}
          >
            На главную
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              try { await signOutCloud(); pixelNavigate("/teacher/"); }
              catch (error) { setError(cloudError(error)); }
            }}
          >
            Выйти
          </Button>
        </div>
      </div>

      <div className="flex gap-3 border-b border-border sm:gap-6">
        {tabs.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className="tab-underline"
            data-active={tab === item.id}
          >
            <ScrambleText
              text={item.label}
              playOnMount
              mountDelayMs={200 + index * 140}
            />
          </button>
        ))}
      </div>

      {message ? (
        <p className="anim-pop rounded-xl bg-accent-soft px-4 py-3 text-sm text-foreground">
          {message}
        </p>
      ) : null}

      {credentials.length ? (
        <Card className="space-y-3">
          <p className="text-sm">Сохраните данные входа и передайте каждому ученику только его пароль. Этот список показывается до ухода со страницы.</p>
          <textarea aria-label="Новые данные входа" readOnly rows={Math.min(credentials.length + 1, 10)}
            className="w-full min-w-0 bg-transparent p-2 text-base sm:text-sm"
            value={credentials.map((s) => `${s.name} | ${s.password}`).join("\n")} />
          <Button variant="ghost" onClick={() => setCredentials([])}>Скрыть пароли</Button>
        </Card>
      ) : null}

      {tab === "class" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card className="space-y-3">
            <h2 className="font-display text-xl font-semibold">Добавить учеников</h2>
            <p className="text-sm text-muted-foreground">
              ФИО с новой строки. Свой пароль — через{" "}
              <code className="rounded bg-background px-1">ФИО | пароль</code>.
              {" "}Минимум 8 символов. Если пароль не указан, создадим случайный.
            </p>
            <textarea
              rows={8}
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              placeholder={"Иванов Иван\nПетрова Анна | …"}
              className="w-full min-w-0 rounded-none border-0 border-b border-[rgb(229_218_195/0.35)] bg-transparent px-0 py-2.5 text-base outline-none transition focus-visible:ring-2 focus-visible:ring-accent/35 sm:text-sm"
            />
            <Button type="button" onClick={addMany}>
              Добавить в класс
            </Button>
            <Button type="button" variant="ghost" onClick={importLocal}>Перенести учеников с этого устройства</Button>
          </Card>

          <Card>
            <h2 className="mb-3 font-display text-xl font-semibold">Список класса</h2>
            {data.students.length === 0 ? (
              <p className="text-sm text-muted-foreground">Класс пуст.</p>
            ) : (
              <ul className="space-y-2 sm:max-h-[28rem] sm:overflow-auto">
                {data.students.map((student) => (
                  <li
                    key={student.id}
                    className="rounded-xl bg-surface/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <NutsBadge value={student.nuts} size="sm" />
                          <div className="min-w-0">
                            <p className="font-semibold [overflow-wrap:anywhere]">{student.name}</p>
                            <p className="text-xs text-muted-foreground">
                              ачивок: {student.achievements.length}
                            </p>
                            {student.achievements[0] ? (
                              <div className="mt-2">
                                <AchievementBadge
                                  icon={student.achievements[0].icon}
                                  title={student.achievements[0].title}
                                  size="sm"
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-danger"
                        aria-label={`Удалить ${student.name}`}
                        onClick={() => {
                          if (confirm(`Удалить ${student.name}?`)) {
                            deleteStudent(student.id);
                            setSelectedIds((prev) =>
                              prev.filter((id) => id !== student.id),
                            );
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                      <Label
                        htmlFor={`pass-${student.id}`}
                        className="col-span-2 mb-0 text-xs sm:col-span-1"
                      >
                        Новый пароль
                      </Label>
                      <PasswordInput
                        id={`pass-${student.id}`}
                        value={passwords[student.id] ?? ""}
                        onChange={(e) => setPasswords((prev) => ({ ...prev, [student.id]: e.target.value }))}
                        placeholder="От 8 символов"
                        className="h-9"
                        autoComplete="off"
                      />
                      <Button size="sm" onClick={() => changePassword(student.id)}>Сохранить</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "award" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold">Кому</h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(data.students.map((s) => s.id))}
                >
                  Все
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds([])}
                >
                  Снять
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Выбрано: {selectedIds.length}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.students.map((student) => {
                const selected = selectedIds.includes(student.id);
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => toggleStudent(student.id)}
                    className={cn(
                      "min-h-11 max-w-full rounded-sm border px-3 py-2 text-left text-sm font-medium text-[#e5dac3] [overflow-wrap:anywhere] transition",
                      selected
                        ? "border-[#e5dac3] bg-[#e5dac3]/12"
                        : "border-[#e5dac3]/25 bg-surface hover:border-[#e5dac3]/50",
                    )}
                  >
                    {student.name}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-4">
            <h2 className="font-display text-xl font-semibold">Что выдать</h2>
            <div>
              <Label htmlFor="nuts">Баллы</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  id="nuts"
                  type="number"
                  className="w-28"
                  value={nutsAmount}
                  onChange={(e) => setNutsAmount(e.target.value)}
                />
                {[1, 5, 10].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setNutsAmount(String(n))}
                  >
                    {n}
                  </Button>
                ))}
                <Button type="button" onClick={awardNuts}>
                  Выдать баллы
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="ach">Ачивка</Label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  id="ach"
                  value={achTitle}
                  onChange={(e) => setAchTitle(e.target.value)}
                  placeholder="свой текст"
                  className="flex-1"
                />
                <Button type="button" variant="secondary" onClick={awardAch}>
                  Выдать ачивку
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "stats" ? (
        <div className="space-y-4">
          <StatsGrid stats={stats} />
          <TeacherCharts students={data.students} />
          <Card>
            <h2 className="mb-3 font-display text-xl font-semibold">Таблица рейтинга</h2>
            {ranked.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пусто</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {ranked.map((student, index) => (
                  <li key={student.id} className="flex flex-col justify-between gap-1 sm:flex-row sm:gap-2">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {index + 1}. {student.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {student.nuts} · ачивок {student.achievements.length}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      ) : null}
    </fieldset>
  );
}
