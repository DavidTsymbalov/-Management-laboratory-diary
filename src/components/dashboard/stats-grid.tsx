import type { ClassStats } from "@/lib/stats";
const items = [
  { key: "totalStudents", label: "Ученики" },
  { key: "totalNuts", label: "Баллы класса" },
  { key: "averageNuts", label: "В среднем на ученика" },
  { key: "totalAchievements", label: "Награды" },
] as const;
export function StatsGrid({ stats }: { stats: ClassStats }) {
  return (
    <dl className="teacher-totals" aria-label="Показатели класса">
      {items.map((item) => (
        <div key={item.key}>
          <dt>{item.label}</dt>
          <dd>{stats[item.key].toLocaleString("ru-RU")}</dd>
        </div>
      ))}
    </dl>
  );
}
