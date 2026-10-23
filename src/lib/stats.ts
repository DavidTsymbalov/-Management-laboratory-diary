import type { Student } from "@/data/seed";
import { rankedStudents } from "@/lib/store";

export type ClassStats = {
  totalStudents: number;
  totalNuts: number;
  totalAchievements: number;
  averageNuts: number;
  leaders: Student[];
  withAchievements: number;
};

export function computeStats(students: Student[]): ClassStats {
  const totalNuts = students.reduce((sum, s) => sum + s.nuts, 0);
  const totalAchievements = students.reduce(
    (sum, s) => sum + s.achievements.length,
    0,
  );
  const withAchievements = students.filter((s) => s.achievements.length > 0).length;
  const ranked = rankedStudents(students);

  return {
    totalStudents: students.length,
    totalNuts,
    totalAchievements,
    averageNuts:
      students.length === 0 ? 0 : Math.round((totalNuts / students.length) * 10) / 10,
    leaders: ranked.slice(0, 3),
    withAchievements,
  };
}
