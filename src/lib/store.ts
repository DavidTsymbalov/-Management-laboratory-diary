"use client";

import {
  DEFAULT_STUDENT_PASSWORD,
  SEED_STUDENTS,
  type Achievement,
  type AchievementIcon,
  type Student,
} from "@/data/seed";

const ACH_ICONS: AchievementIcon[] = ["plus", "bolt", "cross"];

function pickIcon(seed: string): AchievementIcon {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % 97;
  }
  return ACH_ICONS[hash % ACH_ICONS.length];
}

const STORAGE_KEY = "management-laboratory-v3";

export type AppData = {
  students: Student[];
  updatedAt: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function emptyData(): AppData {
  return {
    students: structuredClone(SEED_STUDENTS),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeStudents(raw: unknown[]): Student[] {
  return raw.map((item, index) => {
    const row = item as Partial<Student>;
    return {
      id: row.id ?? `s-migrated-${index}`,
      name: String(row.name ?? `Ученик ${index + 1}`),
      password: String(row.password || DEFAULT_STUDENT_PASSWORD),
      nuts: Math.max(0, Number(row.nuts) || 0),
      achievements: Array.isArray(row.achievements)
        ? row.achievements.map((item, i) => ({
            id: item.id ?? `a-${index}-${i}`,
            title: String(item.title ?? "Ачивка"),
            earnedAt: String(item.earnedAt ?? new Date().toISOString()),
            icon:
              item.icon === "plus" || item.icon === "bolt" || item.icon === "cross"
                ? item.icon
                : pickIcon(String(item.title ?? i)),
          }))
        : [],
    };
  });
}

export function loadData(): AppData {
  if (!canUseStorage()) {
    return emptyData();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // migrate from v2 if present
      const legacy = localStorage.getItem("management-laboratory-v2");
      if (legacy) {
        const parsed = JSON.parse(legacy) as AppData;
        const migrated = {
          students: normalizeStudents(parsed.students ?? []),
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      const fresh = emptyData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as AppData;
    if (!Array.isArray(parsed.students)) throw new Error("bad data");
    return {
      students: normalizeStudents(parsed.students),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    const fresh = emptyData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }
}

export function saveData(data: AppData) {
  const next = { ...data, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetData(): AppData {
  const fresh = emptyData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

export function createStudent(name: string, password?: string): Student | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const pass = (password ?? DEFAULT_STUDENT_PASSWORD).trim() || DEFAULT_STUDENT_PASSWORD;
  return {
    id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    password: pass,
    nuts: 0,
    achievements: [],
  };
}

/** Строка: "ФИО" или "ФИО | пароль" */
export function parseStudentLine(line: string): { name: string; password: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("|").map((p) => p.trim());
  const name = parts[0];
  if (!name) return null;
  return {
    name,
    password: parts[1] || DEFAULT_STUDENT_PASSWORD,
  };
}

export function addStudent(
  students: Student[],
  name: string,
  password?: string,
): Student[] {
  const student = createStudent(name, password);
  if (!student) return students;
  if (students.some((item) => item.name.toLowerCase() === student.name.toLowerCase())) {
    return students;
  }
  return [...students, student];
}

export function setStudentPassword(
  students: Student[],
  studentId: string,
  password: string,
): Student[] {
  const pass = password.trim() || DEFAULT_STUDENT_PASSWORD;
  return students.map((student) =>
    student.id === studentId ? { ...student, password: pass } : student,
  );
}

export function removeStudent(students: Student[], studentId: string): Student[] {
  return students.filter((student) => student.id !== studentId);
}

export function addNuts(students: Student[], studentId: string, amount: number): Student[] {
  return students.map((student) =>
    student.id === studentId
      ? { ...student, nuts: Math.max(0, student.nuts + amount) }
      : student,
  );
}

export function grantAchievement(
  students: Student[],
  studentId: string,
  title: string,
): Student[] {
  const trimmed = title.trim();
  if (!trimmed) return students;

  return students.map((student) => {
    if (student.id !== studentId) return student;
    if (student.achievements.some((item) => item.title === trimmed)) return student;
    const achievement: Achievement = {
      id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: trimmed,
      earnedAt: new Date().toISOString(),
      icon: pickIcon(`${trimmed}-${student.achievements.length}`),
    };
    return { ...student, achievements: [achievement, ...student.achievements] };
  });
}

export function rankedStudents(students: Student[]) {
  return [...students].sort(
    (a, b) => b.nuts - a.nuts || a.name.localeCompare(b.name, "ru"),
  );
}

export function getStudentRank(students: Student[], studentId: string) {
  const ranked = rankedStudents(students);
  const index = ranked.findIndex((s) => s.id === studentId);
  return index >= 0 ? index + 1 : null;
}

export function verifyStudentLogin(
  students: Student[],
  nameOrId: string,
  password: string,
): Student | null {
  const key = nameOrId.trim().toLowerCase();
  const student = students.find(
    (s) => s.id === nameOrId || s.name.trim().toLowerCase() === key,
  );
  if (!student) return null;
  if (student.password !== password) return null;
  return student;
}
