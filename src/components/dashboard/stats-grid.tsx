import type { ClassStats } from "@/lib/stats";

const items = [
  { key: "totalStudents", label: "Учеников", value: (stats: ClassStats) => stats.totalStudents },
  { key: "totalNuts", label: "Всего баллов", value: (stats: ClassStats) => stats.totalNuts },
  { key: "averageNuts", label: "В среднем на ученика", value: (stats: ClassStats) => stats.averageNuts },
  { key: "totalAchievements", label: "Достижений", value: (stats: ClassStats) => stats.totalAchievements },
];

export function StatsGrid({ stats }: { stats: ClassStats }) {
  return <dl className="stats-grid" aria-label="Показатели класса">
    {items.map((item) => <div key={item.key} className="metric-card">
      <dt className="metric-label">{item.label}</dt>
      <dd className="metric-value">{item.value(stats).toLocaleString("ru-RU")}</dd>
    </div>)}
  </dl>;
}
