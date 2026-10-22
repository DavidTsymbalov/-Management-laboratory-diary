import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Начать",
};

const highlights = [
  {
    title: "Для учеников",
    description:
      "Выполняйте задания, копите Орешки, открывайте достижения и следите за местом в рейтинге класса.",
  },
  {
    title: "Для учителей",
    description:
      "Начисляйте баллы, управляйте классом и видьте прогресс учеников в одном спокойном интерфейсе.",
  },
  {
    title: "Что дальше",
    description:
      "Регистрация и живые данные появятся после подключения Supabase. Сейчас доступно демо на главной.",
  },
] as const;

export default function GetStartedPage() {
  return (
    <Container className="py-12 sm:py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Начать работу
          </h1>
          <p className="mt-2 text-muted-foreground">
            Management Laboratory помогает классу видеть прогресс через Орешки,
            достижения и рейтинг.
          </p>
        </div>

        <div className="grid gap-4">
          {highlights.map((item) => (
            <Card key={item.title}>
              <CardHeader className="mb-0">
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <EmptyState
          icon={<Sparkles className="h-5 w-5" aria-hidden />}
          title="Регистрация скоро"
          description="Создание аккаунтов ещё в работе. Посмотрите демо кабинета ученика на главной странице — так будет выглядеть продукт."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button href="/">Смотреть демо</Button>
              <Button href="/sign-in" variant="secondary">
                К странице входа
              </Button>
            </div>
          }
        />
      </div>
    </Container>
  );
}
