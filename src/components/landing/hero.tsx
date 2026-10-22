import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-10 pt-12 sm:pb-14 sm:pt-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-16 h-64 w-64 rounded-full bg-accent/35 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 left-0 h-56 w-56 rounded-full bg-accent-soft/80 blur-3xl"
      />

      <div className="relative max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Школьный командный проект
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem] lg:leading-[1.1]">
          Management Laboratory
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Геймифицированная платформа баллов и достижений: ученики зарабатывают
          Орешки, открывают значки и поднимаются в рейтинге класса, а учителя
          управляют прогрессом в одном месте.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button href="/get-started" size="lg">
            Начать
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button href="/sign-in" variant="secondary" size="lg">
            Войти
          </Button>
        </div>
      </div>
    </section>
  );
}
