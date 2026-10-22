import Link from "next/link";
import { Nut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-border/10 bg-background/90 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-3">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-border bg-accent shadow-[var(--shadow-card)] transition group-hover:translate-x-px group-hover:translate-y-px group-hover:shadow-none">
            <Nut className="h-4 w-4" aria-hidden />
          </span>
          <span className="truncate font-display text-sm font-bold tracking-tight sm:text-base">
            Management Laboratory
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-2" aria-label="Основная навигация">
          <Button href="/sign-in" variant="ghost" size="sm">
            Войти
          </Button>
          <Button href="/get-started" size="sm">
            Начать
          </Button>
        </nav>
      </Container>
    </header>
  );
}
