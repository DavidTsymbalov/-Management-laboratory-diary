export const ATTENDANCE_STATUSES = [
  { value: "present", label: "Присутствовал", short: "П" },
  { value: "absent", label: "Отсутствовал", short: "Н" },
  { value: "late", label: "Опоздал", short: "О" },
  { value: "excused", label: "Уважительная причина", short: "У" },
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]["value"];
export type AttendanceLesson = {
  id: string;
  lesson_date: string;
  cancelled: boolean;
  cancellation_reason: string | null;
  revision: number;
};
export type AttendanceRecord = {
  lesson_id: string;
  student_key: string;
  student_name: string;
  status: AttendanceStatus | null;
  revision: number;
};
export type AttendanceSnapshot = {
  lessons: AttendanceLesson[];
  records: AttendanceRecord[];
};
export function moscowDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftAttendanceMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
export function monthThursdays(month: string) {
  const dates: string[] = [];
  const next = `${shiftAttendanceMonth(month, 1)}-01`;
  for (let day = 1; day <= 31; day++) {
    const value = `${month}-${String(day).padStart(2, "0")}`;
    if (value >= next) break;
    const date = new Date(`${value}T12:00:00Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 7) !== month
    )
      break;
    if (date.getUTCDay() === 4) dates.push(value);
  }
  return dates;
}
export function suggestedLessonDate(month: string, today = moscowDate()) {
  const dates = monthThursdays(month);
  return dates.find((date) => date >= today) ?? dates[0] ?? `${month}-01`;
}
export function attendanceSummary(
  lessons: AttendanceLesson[],
  records: AttendanceRecord[],
) {
  const held = new Set(
    lessons.filter((item) => !item.cancelled).map((item) => item.id),
  );
  const result = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    unmarked: 0,
    attended: 0,
    marked: 0,
    percent: null as number | null,
  };
  for (const item of records) {
    if (!held.has(item.lesson_id)) continue;
    if (item.status) {
      result[item.status]++;
      result.marked++;
    } else result.unmarked++;
  }
  result.attended = result.present + result.late;
  result.percent = result.marked
    ? Math.round((result.attended / result.marked) * 100)
    : null;
  return result;
}
