"use client";

import { Award, Hash, TrendingUp, Users } from "lucide-react";
import type { ClassStats } from "@/lib/stats";

const items = [
  {
    key: "totalStudents" as const,
    label: "Учеников",
    icon: Users,
    format: (s: ClassStats) => String(s.totalStudents),
  },
  {
    key: "totalNuts" as const,
    label: "Всего баллов",
    icon: Hash,
    format: (s: ClassStats) => String(s.totalNuts),
  },
  {
    key: "averageNuts" as const,
    label: "Среднее на ученика",
    icon: TrendingUp,
    format: (s: ClassStats) => String(s.averageNuts),
  },
  {
    key: "totalAchievements" as const,
    label: "Ачивок выдано",
    icon: Award,
    format: (s: ClassStats) => String(s.totalAchievements),
  },
];

export function StatsGrid({ stats }: { stats: ClassStats }) {
  return (
    <section className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className={`anim-fade-up-delay-${Math.min(index, 3)} space-y-3 bg-card p-5`}
          >
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {item.label}
            </p>
            <p className="font-display text-3xl font-bold tabular-nums tracking-tight">
              {item.format(stats)}
            </p>
          </div>
        );
      })}
    </section>
  );
}
