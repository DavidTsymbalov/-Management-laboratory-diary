"use client";

import type { Achievement, Student } from "@/data/seed";
import type { AppData } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { studentEmail, teacherEmail } from "@/lib/student-identity";
import { setStudentSessionId, setTeacherLoggedIn } from "@/lib/session";

export type CloudRole = { role: "teacher" | "student"; id: string };

function rememberRole(role: CloudRole | null) {
  setTeacherLoggedIn(role?.role === "teacher");
  setStudentSessionId(role?.role === "student" ? role.id : null);
}

export async function getCloudRole(): Promise<CloudRole | null> {
  const db = getSupabase();
  const { data: session } = await db.auth.getSession();
  if (!session.session) {
    rememberRole(null);
    return null;
  }
  // Server verification, never trust the old local session flags for access.
  const { data: { user }, error } = await db.auth.getUser();
  if (error) {
    rememberRole(null);
    throw error;
  }
  if (!user) return null;
  const teacher = await db.from("teachers").select("user_id").eq("user_id", user.id).maybeSingle();
  if (teacher.error) throw teacher.error;
  if (teacher.data) {
    const role = { role: "teacher", id: user.id } as const;
    rememberRole(role);
    return role;
  }
  const student = await db.from("students").select("id").eq("id", user.id).maybeSingle();
  if (student.error) throw student.error;
  const role = student.data ? { role: "student", id: student.data.id } as const : null;
  rememberRole(role);
  return role;
}

export async function signInCloud(login: string, password: string, expected: CloudRole["role"]) {
  const email = expected === "student" ? await studentEmail(login) : await teacherEmail(login);
  const db = getSupabase();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const role = await getCloudRole();
  if (role?.role !== expected) {
    await signOutCloud();
    throw new Error(expected === "teacher" ? "Этому аккаунту не назначены права учителя." : "Ученик не найден в классе.");
  }
  return role;
}

export async function signOutCloud() {
  const { error } = await getSupabase().auth.signOut({ scope: "local" });
  if (error) throw error;
  rememberRole(null);
}

export async function loadCloudData(): Promise<AppData> {
  const db = getSupabase();
  const [students, achievements] = await Promise.all([
    db.from("students").select("id,name,nuts").order("name"),
    db.from("achievements").select("id,student_id,title,icon,earned_at").order("earned_at", { ascending: false }),
  ]);
  if (students.error) throw students.error;
  if (achievements.error) throw achievements.error;
  return {
    updatedAt: new Date().toISOString(),
    students: (students.data ?? []).map((row): Student => ({
      id: row.id, name: row.name, nuts: row.nuts, password: "",
      achievements: (achievements.data ?? []).filter((a) => a.student_id === row.id).map((a): Achievement => ({
        id: a.id, title: a.title, icon: a.icon, earnedAt: a.earned_at,
      })),
    })),
  };
}

export async function getCloudRank(): Promise<{ rank: number; total: number }> {
  const { data, error } = await getSupabase().rpc("my_student_rank");
  if (error) throw error;
  if (!data?.length) throw new Error("Ученик не найден в классе.");
  return { rank: Number(data[0].rank), total: Number(data[0].total) };
}

export async function awardCloudNuts(ids: string[], amount: number) {
  const { error } = await getSupabase().rpc("award_nuts", { student_ids: ids, amount });
  if (error) throw error;
}

export async function awardCloudAchievement(ids: string[], title: string) {
  const { error } = await getSupabase().rpc("award_achievement", { student_ids: ids, achievement_title: title.trim() });
  if (error) throw error;
}

export type StudentInput = { name: string; password: string; nuts?: number; achievements?: Achievement[] };
export type AddStudentsResult = { created: string[]; errors: string[] };

export async function manageCloudStudents(body: Record<string, unknown>) {
  const { data: { session }, error: sessionError } = await getSupabase().auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) throw new Error("Войдите в кабинет учителя.");
  const { data, error } = await getSupabase().functions.invoke("manage-students", {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    // FunctionsHttpError keeps the safe user-facing response in its context.
    if (error.context instanceof Response) {
      const result = await error.context.json().catch(() => null);
      if (result?.error) throw new Error(result.error);
    }
    throw error;
  }
  return data;
}

export async function addCloudStudents(students: StudentInput[]): Promise<AddStudentsResult> {
  return manageCloudStudents({ action: "create", students });
}

/** Refresh while visible and immediately on returning to the tab; no realtime setup required. */
export function watchCloudData(refresh: () => Promise<void>) {
  let inFlight = false;
  const run = () => {
    if (document.visibilityState !== "visible" || inFlight) return;
    inFlight = true;
    void refresh().finally(() => { inFlight = false; });
  };
  const timer = window.setInterval(run, 15000);
  window.addEventListener("focus", run);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", run);
  };
}
