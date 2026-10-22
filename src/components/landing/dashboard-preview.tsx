import { CheckCircle2, Circle, Nut } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  demoAchievements,
  demoLeaderboard,
  demoStudent,
  formatNuts,
} from "@/data/demo";
import { cn } from "@/lib/cn";

export function DashboardPreview() {
  const earnedCount = demoAchievements.filter((item) => item.earned).length;

  return (
    <section aria-labelledby="preview-heading" className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Превью продукта
          </p>
          <h2
            id="preview-heading"
            className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Демо кабинета ученика
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Это только пример данных — пока без подключения к аккаунту и базе.
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border-2 border-border bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide">
          Демо
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-[linear-gradient(160deg,#ffffff_0%,#fff8e8_100%)]">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{demoStudent.className}</p>
              <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight">
                {demoStudent.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Следите за Орешками, значками и местом в классе.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-2xl border-2 border-border bg-accent px-4 py-3 shadow-[var(--shadow-card)]">
              <Nut className="h-5 w-5" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide">Орешки</p>
                <p className="font-display text-xl font-bold tabular-nums">
                  {formatNuts(demoStudent.nuts)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border-2 border-border/15 bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Место в классе
              </p>
              <p className="mt-2 font-display text-3xl font-bold tabular-nums">
                №{demoStudent.rank}
              </p>
            </div>
            <div className="rounded-2xl border-2 border-border/15 bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Достижения
              </p>
              <p className="mt-2 font-display text-3xl font-bold tabular-nums">
                {earnedCount}/{demoAchievements.length}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold tracking-tight">Недавние достижения</h3>
            <ul className="space-y-2">
              {demoAchievements.map((achievement) => (
                <li
                  key={achievement.id}
                  className="flex items-start gap-3 rounded-xl border-2 border-border/10 bg-card/80 px-3 py-3"
                >
                  {achievement.earned ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-success"
                      aria-hidden
                    />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                  )}
                  <div>
                    <p className="text-sm font-semibold">{achievement.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {achievement.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Рейтинг класса</CardTitle>
            <CardDescription>Лидеры этой недели (демо)</CardDescription>
          </CardHeader>
          <ol className="space-y-2">
            {demoLeaderboard.map((entry) => (
              <li
                key={entry.rank}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border-2 px-3 py-3",
                  entry.isCurrentUser
                    ? "border-border bg-accent-soft"
                    : "border-border/10 bg-background/50",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-card text-sm font-bold tabular-nums">
                    {entry.rank}
                  </span>
                  <p className="truncate text-sm font-semibold">
                    {entry.name}
                    {entry.isCurrentUser ? (
                      <span className="ml-2 text-xs font-medium text-muted-foreground">
                        вы
                      </span>
                    ) : null}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatNuts(entry.nuts)}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </section>
  );
}
