import { Award, Trophy, Coins } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    title: "Points",
    description:
      "Students earn virtual Nuts for completing tasks. Teachers award points quickly and keep progress visible.",
    icon: Coins,
  },
  {
    title: "Achievements",
    description:
      "Unlock badges for streaks, teamwork, and milestones so effort feels rewarding beyond the scoreboard.",
    icon: Award,
  },
  {
    title: "Leaderboard",
    description:
      "Friendly class rankings highlight who’s leading while keeping the tone collaborative, not cutthroat.",
    icon: Trophy,
  },
] as const;

export function FeatureCards() {
  return (
    <section aria-labelledby="features-heading" className="space-y-8">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          What you get
        </p>
        <h2
          id="features-heading"
          className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Progress that students can see
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          One calm workspace for points, achievements, and class standings —
          built for teachers and students alike.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {features.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="h-full">
            <CardHeader>
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
