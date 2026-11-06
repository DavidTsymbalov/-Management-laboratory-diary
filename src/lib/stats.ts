import type { Student } from "@/data/seed";
import { rankedStudents } from "@/lib/store";

export type ClassStats = {
  totalStudents: number;
  totalNuts: number;
  totalAchievements: number;
  averageNuts: number;
  leaders: Student[];
  withAchievements: number;
  withPoints: number;
  medianNuts: number;
  minimumNuts: number;
  maximumNuts: number;
  achievementCoverage: number;
  awardsThisWeek: number;
  newThisWeek: number;
  distribution: { label: string; count: number }[];
  weeklyAwards: { day: string; count: number }[];
};
const dayFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function moscowDay(date: Date) {
  return dayFormatter.format(date);
}
export function computeStats(
  students: Student[],
  now = new Date(),
): ClassStats {
  const today = moscowDay(now);
  const anchor = new Date(`${today}T12:00:00Z`);
  const weeklyAwards = Array.from({ length: 7 }, (_, index) => ({
    day: new Date(anchor.getTime() - (6 - index) * 86400000)
      .toISOString()
      .slice(0, 10),
    count: 0,
  }));
  const weeks = new Map(weeklyAwards.map((item) => [item.day, item]));
  const sorted = students.map((s) => s.nuts).sort((a, b) => a - b);
  const totalNuts = sorted.reduce((sum, n) => sum + n, 0);
  let totalAchievements = 0,
    withAchievements = 0,
    newThisWeek = 0;
  const distribution = [
    { label: "0", count: 0 },
    { label: "1–24", count: 0 },
    { label: "25–49", count: 0 },
    { label: "50–99", count: 0 },
    { label: "100+", count: 0 },
  ];
  for (const student of students) {
    totalAchievements += student.achievements.length;
    if (student.achievements.length) withAchievements++;
    distribution[
      student.nuts === 0
        ? 0
        : student.nuts < 25
          ? 1
          : student.nuts < 50
            ? 2
            : student.nuts < 100
              ? 3
              : 4
    ].count++;
    if (student.createdAt) {
      const date = new Date(student.createdAt);
      if (
        Number.isFinite(date.getTime()) &&
        date <= now &&
        weeks.has(moscowDay(date))
      )
        newThisWeek++;
    }
    for (const award of student.achievements) {
      const date = new Date(award.earnedAt);
      if (Number.isFinite(date.getTime()) && date <= now) {
        const bucket = weeks.get(moscowDay(date));
        if (bucket) bucket.count++;
      }
    }
  }
  const mid = Math.floor(sorted.length / 2);
  return {
    totalStudents: students.length,
    totalNuts,
    totalAchievements,
    averageNuts: students.length
      ? Math.round((totalNuts / students.length) * 10) / 10
      : 0,
    leaders: rankedStudents(students).slice(0, 3),
    withAchievements,
    withPoints: students.filter((s) => s.nuts > 0).length,
    medianNuts: sorted.length
      ? sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2
      : 0,
    minimumNuts: sorted[0] ?? 0,
    maximumNuts: sorted.at(-1) ?? 0,
    achievementCoverage: students.length
      ? Math.round((withAchievements / students.length) * 100)
      : 0,
    awardsThisWeek: weeklyAwards.reduce((sum, item) => sum + item.count, 0),
    newThisWeek,
    distribution,
    weeklyAwards,
  };
}
