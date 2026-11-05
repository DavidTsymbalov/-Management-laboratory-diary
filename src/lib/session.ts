"use client";

// Navigation hints only. Actual access is checked by Supabase Auth, RLS and the Edge Function.

const TEACHER_KEY = "ml-teacher-session";
const ADMIN_KEY = "ml-admin-session";
const STUDENT_KEY = "ml-student-session";

function readHint(key: string) {
  try { return typeof window === "undefined" ? null : sessionStorage.getItem(key); }
  catch { return null; }
}
function writeHint(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch { /* Optional navigation hints must never prevent authentication. */ }
}

export function isTeacherLoggedIn() {
  return readHint(TEACHER_KEY) === "1";
}

export function setTeacherLoggedIn(value: boolean) {
  writeHint(TEACHER_KEY, value ? "1" : null);
}

export function isAdminLoggedIn() {
  return readHint(ADMIN_KEY) === "1";
}

export function setAdminLoggedIn(value: boolean) {
  writeHint(ADMIN_KEY, value ? "1" : null);
}

export function getStudentSessionId() {
  return readHint(STUDENT_KEY);
}

export function setStudentSessionId(id: string | null) {
  writeHint(STUDENT_KEY, id);
}

export function isStudentLoggedIn() {
  return Boolean(getStudentSessionId());
}
