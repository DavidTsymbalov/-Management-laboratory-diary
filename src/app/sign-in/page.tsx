import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Вход",
};

export default function SignInPage() {
  const configured = isSupabaseConfigured();

  return (
    <Container className="py-12 sm:py-16">
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Вход</h1>
          <p className="mt-2 text-muted-foreground">
            Войдите в аккаунт Management Laboratory, когда подключение будет
            готово.
          </p>
        </div>

        {configured ? (
          <Card>
            <CardHeader>
              <CardTitle>Авторизация скоро</CardTitle>
              <CardDescription>
                Окружение Supabase настроено. Сама форма входа появится в
                следующем этапе — пока вход намеренно отключён.
              </CardDescription>
            </CardHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Электронная почта</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@school.edu"
                  disabled
                />
              </div>
              <div>
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled
                />
              </div>
              <Button type="button" disabled className="w-full">
                Войти (скоро)
              </Button>
            </div>
          </Card>
        ) : (
          <EmptyState
            icon={<KeyRound className="h-5 w-5" aria-hidden />}
            title="Вход пока недоступен"
            description="Авторизация через Supabase ещё не подключена. Пока можно изучить демо на главной странице — это превью продукта."
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button href="/" variant="secondary">
                  На главную
                </Button>
                <Button href="/get-started">Как это работает</Button>
              </div>
            }
          />
        )}
      </div>
    </Container>
  );
}
