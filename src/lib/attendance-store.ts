"use client";
import { getSupabase } from "@/lib/supabase";
import type {
  AttendanceLesson,
  AttendanceRecord,
  AttendanceSnapshot,
  AttendanceStatus,
} from "@/lib/attendance";
export async function loadAttendance(
  month: string,
): Promise<AttendanceSnapshot> {
  const { data, error } = await getSupabase().rpc("load_attendance_month", {
    month_date: `${month}-01`,
  });
  if (error) throw error;
  if (!Array.isArray(data?.lessons) || !Array.isArray(data?.records))
    throw new Error("Не удалось прочитать классный журнал.");
  return data;
}
export async function createAttendanceLessons(
  dates: string[],
): Promise<AttendanceLesson[]> {
  const { data, error } = await getSupabase().rpc("create_attendance_lessons", {
    lesson_dates: dates,
  });
  if (error) throw error;
  if (!Array.isArray(data))
    throw new Error("Создание занятия не подтверждено. Повторите попытку.");
  return data;
}
export async function setAttendanceLessonState(
  lesson: AttendanceLesson,
  cancelled: boolean,
  reason: string,
) {
  const { data, error } = await getSupabase().rpc(
    "set_attendance_lesson_state",
    {
      target_lesson: lesson.id,
      make_cancelled: cancelled,
      reason,
      expected_revision: lesson.revision,
    },
  );
  if (error) throw error;
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved?.id)
    throw new Error("Изменение занятия не подтверждено. Обновите журнал.");
  return saved as AttendanceLesson;
}
export async function saveAttendanceMarks(
  lesson: AttendanceLesson,
  changes: {
    student_key: string;
    status: AttendanceStatus | null;
    expected_revision: number;
  }[],
): Promise<AttendanceRecord[]> {
  const { data, error } = await getSupabase().rpc("save_attendance_marks", {
    target_lesson: lesson.id,
    lesson_revision: lesson.revision,
    changes,
  });
  if (error) throw error;
  if (!Array.isArray(data))
    throw new Error("Сохранение отметок не подтверждено. Обновите журнал.");
  return data;
}
