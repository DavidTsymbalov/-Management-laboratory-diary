import { Award, Trophy, Coins } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    title: "Баллы",
    description:
      "Ученики получают виртуальные Орешки за выполненные задания. Учителя быстро начисляют баллы и делают прогресс видимым.",
    icon: Coins,
  },
  {
    title: "Достижения",
    description:
      "Значки за серии, командную работу и важные этапы — чтобы усилия ценились не только в таблице рейтинга.",
    icon: Award,
  },
  {
    title: "Рейтинг",
    description:
      "Дружелюбный рейтинг класса показывает лидеров и поддерживает командный дух, а не жёсткую конкуренцию.",
    icon: Trophy,
  },
] as const;

export function FeatureCards() {
  return (
    <section aria-labelledby="features-heading" className="space-y-8">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Возможности
        </p>
        <h2
          id="features-heading"
          className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Прогресс, который видно
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Одно спокойное пространство для баллов, достижений и рейтинга класса —
          и для учителей, и для учеников.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {features.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="h-full">
            <CardHeader className="mb-0">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border-2 border-border bg-accent-soft">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
