"use client";

import type { Achievement, Student } from "@/data/seed";
import type { AppData } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { studentEmail, teacherEmail } from "@/lib/student-identity";
import { setStudentSessionId, setTeacherLoggedIn } from "@/lib/session";

export type CloudRole = {
  role: "teacher" | "student" | "admin";
  id: string;
  name: string;
};

function rememberRole(role: CloudRole | null) {
  setTeacherLoggedIn(role?.role === "teacher");
  setStudentSessionId(
    role?.role === "student" || role?.role === "admin" ? role.id : null,
  );
}

export async function getCloudRole(): Promise<CloudRole | null> {
  const db = getSupabase();
  const { data: session } = await db.auth.getSession();
  if (!session.session) {
    rememberRole(null);
    return null;
  }
  // Server verification, never trust the old local session flags for access.
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error) {
    rememberRole(null);
    throw error;
  }
  if (!user) return null;
  const [teacher, student, assigned] = await Promise.all([
    db
      .from("teachers")
      .select("user_id,name")
      .eq("user_id", user.id)
      .maybeSingle(),
    db.from("students").select("id,name").eq("id", user.id).maybeSingle(),
    db
      .from("student_administrators")
      .select("student_id")
      .eq("student_id", user.id)
      .maybeSingle(),
  ]);
  if (teacher.error) throw teacher.error;
  if (student.error) throw student.error;
  if (assigned.error && !missingStaffMigration(assigned.error))
    throw assigned.error;
  const role: CloudRole | null = teacher.data
    ? { role: "teacher", id: user.id, name: teacher.data.name }
    : student.data
      ? {
          role: assigned.data ? "admin" : "student",
          id: user.id,
          name: student.data.name,
        }
      : null;
  rememberRole(role);
  return role;
}

export async function signInCloud(
  login: string,
  password: string,
  expected: CloudRole["role"],
) {
  const email =
    expected === "teacher"
      ? await teacherEmail(login)
      : await studentEmail(login);
  const db = getSupabase();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const role = await getCloudRole();
  if (
    role?.role !== expected &&
    !(expected === "student" && role?.role === "admin")
  ) {
    await signOutCloud();
    throw new Error(
      expected === "teacher"
        ? "Этому аккаунту не назначены права учителя."
        : expected === "admin"
          ? "Преподаватель не назначил этому ученику права администратора."
          : "Ученик не найден в классе.",
    );
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
    db.from("students").select("id,name,nuts,created_at").order("name"),
    db
      .from("achievements")
      .select("id,student_id,title,icon,earned_at")
      .order("earned_at", { ascending: false }),
  ]);
  if (students.error) throw students.error;
  if (achievements.error) throw achievements.error;
  const awardsByStudent = new Map<string, Achievement[]>();
  for (const a of achievements.data ?? []) {
    const list = awardsByStudent.get(a.student_id) ?? [];
    list.push({
      id: a.id,
      title: a.title,
      icon: a.icon,
      earnedAt: a.earned_at,
    });
    awardsByStudent.set(a.student_id, list);
  }
  return {
    updatedAt: new Date().toISOString(),
    students: (students.data ?? []).map((row): Student => ({
      id: row.id,
      name: row.name,
      nuts: row.nuts,
      password: "",
      createdAt: row.created_at,
      achievements: awardsByStudent.get(row.id) ?? [],
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
  const { error } = await getSupabase().rpc("award_nuts", {
    student_ids: ids,
    amount,
  });
  if (error) throw error;
}

export async function awardCloudAchievement(ids: string[], title: string) {
  const { error } = await getSupabase().rpc("award_achievement", {
    student_ids: ids,
    achievement_title: title.trim(),
  });
  if (error) throw error;
}

export type StudentInput = {
  name: string;
  password: string;
  nuts?: number;
  achievements?: Achievement[];
};
export type AddStudentsResult = { created: string[]; errors: string[] };

export async function manageCloudStudents(body: Record<string, unknown>) {
  const {
    data: { session },
    error: sessionError,
  } = await getSupabase().auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) throw new Error("Войдите в кабинет учителя.");
  const { data, error } = await getSupabase().functions.invoke(
    "manage-students",
    {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );
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

export async function addCloudStudents(
  students: StudentInput[],
): Promise<AddStudentsResult> {
  return manageCloudStudents({ action: "create", students });
}

/** Refresh while visible and immediately on returning to the tab; no realtime setup required. */
export function watchCloudData(refresh: () => Promise<void>) {
  let inFlight = false;
  const run = () => {
    if (document.visibilityState !== "visible" || inFlight) return;
    inFlight = true;
    void refresh().finally(() => {
      inFlight = false;
    });
  };
  const timer = window.setInterval(run, 15000);
  window.addEventListener("focus", run);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", run);
  };
}

export type AdministratorLimits = {
  capacity: number;
  deleted: number;
  points: number;
  awards: number;
};
export type AdministratorAssignment = {
  student_id: string;
  capacity_limit: number;
  deleted_limit: number;
  points_limit: number;
  awards_limit: number;
};
export type AdministratorQuota = {
  limits: AdministratorLimits;
  used: { added: number; deleted: number; points: number; awards: number };
  day: string;
};
export type ActivityEntry = {
  id: string;
  actor_id: string | null;
  actor_name: string;
  kind:
    | "create"
    | "delete"
    | "points"
    | "achievement"
    | "admin_grant"
    | "admin_revoke"
    | "admin_limits";
  student_id: string | null;
  student_name: string;
  amount: number | null;
  title: string | null;
  created_at: string;
};
export const DEFAULT_ADMINISTRATOR_LIMITS: AdministratorLimits = {
  capacity: 26,
  deleted: 5,
  points: 100,
  awards: 10,
};
function missingStaffMigration(error: { code?: string }) {
  return error.code === "42P01" || error.code === "PGRST205";
}
export type StaffExtras = {
  available: boolean;
  administrators: AdministratorAssignment[];
  activity: ActivityEntry[];
  quota: AdministratorQuota | null;
  moreActivity: boolean;
};
export async function loadStaffExtras(
  role: "teacher" | "admin",
): Promise<StaffExtras> {
  const db = getSupabase();
  const [assigned, activity, quota] = await Promise.all([
    db
      .from("student_administrators")
      .select(
        "student_id,capacity_limit,deleted_limit,points_limit,awards_limit",
      ),
    db
      .from("classroom_activity")
      .select(
        "id,actor_id,actor_name,kind,student_id,student_name,amount,title,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(201),
    role === "admin"
      ? db.rpc("my_administrator_quota")
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (assigned.error && missingStaffMigration(assigned.error))
    return {
      available: false,
      administrators: [],
      activity: [],
      quota: null,
      moreActivity: false,
    };
  if (assigned.error) throw assigned.error;
  if (activity.error) throw activity.error;
  if (quota.error) throw quota.error;
  return {
    available: true,
    administrators: assigned.data ?? [],
    activity: (activity.data ?? []).slice(0, 200),
    quota: quota.data,
    moreActivity: (activity.data?.length ?? 0) > 200,
  };
}
export async function configureStudentAdministrator(
  id: string,
  limits: AdministratorLimits,
  enabled = true,
) {
  const { error } = await getSupabase().rpc("configure_student_administrator", {
    target_id: id,
    limits,
    enabled,
  });
  if (error) throw error;
}
export async function viewStudentPassword(id: string): Promise<string> {
  const result = await manageCloudStudents({ action: "view_password", id });
  if (typeof result?.password !== "string")
    throw new Error("Пароль недоступен.");
  return result.password;
}
