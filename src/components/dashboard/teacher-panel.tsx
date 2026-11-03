"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  addNuts,
  addStudent,
  grantAchievement,
  loadData,
  parseStudentLine,
  rankedStudents,
  removeStudent,
  resetData,
  saveData,
  setStudentPassword,
  type AppData,
} from "@/lib/store";
import { computeStats } from "@/lib/stats";
import { isTeacherLoggedIn, setTeacherLoggedIn } from "@/lib/session";
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!isTeacherLoggedIn()) {
        router.replace("/teacher/");
        return;
      }
      setData(loadData());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

  const ranked = useMemo(
    () => (data ? rankedStudents(data.students) : []),
    [data],
  );
  const stats = useMemo(() => computeStats(data?.students ?? []), [data]);

  function commit(students: AppData["students"]) {
    if (!data) return;
    setData(saveData({ ...data, students }));
  }

  function toggleStudent(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function addMany() {
    if (!data) return;
    const lines = namesText.split("\n");
    let next = data.students;
    let added = 0;
    for (const line of lines) {
      const parsed = parseStudentLine(line);
      if (!parsed) continue;
      const before = next.length;
      next = addStudent(next, parsed.name, parsed.password);
      if (next.length > before) added += 1;
    }
    commit(next);
    setNamesText("");
    setMessage(added ? `Добавлено: ${added}` : "Никого не добавили — проверьте ФИО.");
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
    let next = data.students;
    for (const id of selectedIds) next = addNuts(next, id, amount);
    commit(next);
    setMessage(`Баллы выданы: ${amount > 0 ? "+" : ""}${amount} × ${selectedIds.length}`);
  }

  function awardAch() {
    if (!data || selectedIds.length === 0 || !achTitle.trim()) {
      setMessage("Выберите учеников и напишите ачивку.");
      return;
    }
    let next = data.students;
    for (const id of selectedIds) next = grantAchievement(next, id, achTitle);
    commit(next);
    setAchTitle("");
    setMessage(`Ачивка выдана × ${selectedIds.length}`);
  }

  if (!data) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "class", label: "Класс" },
    { id: "award", label: "Выдача" },
    { id: "stats", label: "Графики" },
  ];

  return (
    <div className="space-y-8">
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Очистить весь класс?")) {
                setData(resetData());
                setSelectedIds([]);
              }
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
            onClick={() => {
              setTeacherLoggedIn(false);
              pixelNavigate("/teacher/");
            }}
          >
            Выйти
          </Button>
        </div>
      </div>

      <div className="flex gap-6 border-b border-border">
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

      {tab === "class" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card className="space-y-3">
            <h2 className="font-display text-xl font-semibold">Добавить учеников</h2>
            <p className="text-sm text-muted-foreground">
              ФИО с новой строки. Свой пароль — через{" "}
              <code className="rounded bg-background px-1">ФИО | пароль</code>.
            </p>
            <textarea
              rows={8}
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              placeholder={"Иванов Иван\nПетрова Анна | …"}
              className="w-full rounded-none border-0 border-b border-[rgb(229_218_195/0.35)] bg-transparent px-0 py-2.5 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-accent/35"
            />
            <Button type="button" onClick={addMany}>
              Добавить в класс
            </Button>
          </Card>

          <Card>
            <h2 className="mb-3 font-display text-xl font-semibold">Список класса</h2>
            {data.students.length === 0 ? (
              <p className="text-sm text-muted-foreground">Класс пуст.</p>
            ) : (
              <ul className="max-h-[28rem] space-y-2 overflow-auto">
                {data.students.map((student) => (
                  <li
                    key={student.id}
                    className="rounded-xl bg-surface/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-3">
                          <NutsBadge value={student.nuts} size="sm" />
                          <div className="min-w-0">
                            <p className="font-semibold">{student.name}</p>
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
                        className="rounded p-1 text-danger"
                        aria-label="Удалить"
                        onClick={() => {
                          if (confirm(`Удалить ${student.name}?`)) {
                            commit(removeStudent(data.students, student.id));
                            setSelectedIds((prev) =>
                              prev.filter((id) => id !== student.id),
                            );
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Label
                        htmlFor={`pass-${student.id}`}
                        className="mb-0 shrink-0 text-xs"
                      >
                        Пароль
                      </Label>
                      <PasswordInput
                        id={`pass-${student.id}`}
                        value={student.password}
                        onChange={(e) =>
                          commit(
                            setStudentPassword(
                              data.students,
                              student.id,
                              e.target.value,
                            ),
                          )
                        }
                        className="h-9"
                        autoComplete="off"
                      />
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
                      "rounded-sm border px-3 py-2 text-sm font-medium text-[#e5dac3] transition",
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
                  <li key={student.id} className="flex justify-between gap-2">
                    <span>
                      {index + 1}. {student.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {student.nuts} · ачивок {student.achievements.length}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
