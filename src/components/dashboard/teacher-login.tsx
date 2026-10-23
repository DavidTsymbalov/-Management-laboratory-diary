"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TEACHER } from "@/data/seed";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { isTeacherLoggedIn, setTeacherLoggedIn } from "@/lib/session";

export function TeacherLogin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isTeacherLoggedIn()) {
        router.replace("/teacher/dashboard/");
        return;
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (
      username.trim() === TEACHER.username &&
      password === TEACHER.password
    ) {
      setTeacherLoggedIn(true);
      router.push("/teacher/dashboard/");
      return;
    }
    setError("Неверный логин или пароль.");
  }

  if (!ready) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div className="mx-auto max-w-md space-y-8">
      <div>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Учитель
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Вход
        </h1>
      </div>
      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="username">Имя пользователя</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Пароль</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full">
            Войти
          </Button>
        </form>
      </Card>
      <Button href="/" variant="ghost" className="mx-auto">
        На главную
      </Button>
    </div>
  );
}
