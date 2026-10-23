"use client";

const TEACHER_KEY = "ml-teacher-session";
const STUDENT_KEY = "ml-student-session";

export function isTeacherLoggedIn() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(TEACHER_KEY) === "1";
}

export function setTeacherLoggedIn(value: boolean) {
  if (value) sessionStorage.setItem(TEACHER_KEY, "1");
  else sessionStorage.removeItem(TEACHER_KEY);
}

export function getStudentSessionId() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(STUDENT_KEY);
}

export function setStudentSessionId(id: string | null) {
  if (id) sessionStorage.setItem(STUDENT_KEY, id);
  else sessionStorage.removeItem(STUDENT_KEY);
}

export function isStudentLoggedIn() {
  return Boolean(getStudentSessionId());
}
