"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { getCloudRole, signInCloud } from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";

export function StudentLogin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getCloudRole().then((role) => {
      if (!active) return;
      if (role?.role === "student") router.replace("/student/dashboard/");
      else setReady(true);
    }).catch((error) => {
      if (active) { setError(cloudError(error)); setReady(true); }
    });
    return () => { active = false; };
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInCloud(name, password, "student");
      router.push("/student/dashboard/");
    } catch (error) {
      setError(cloudError(error));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div className="mx-auto max-w-md space-y-8">
      <div>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Ученик
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Вход
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Введите ФИО и пароль.
        </p>
      </div>

      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="name">ФИО</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="username"
              placeholder="Как записал учитель"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Пароль</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Входим…" : "Войти в кабинет"}
          </Button>
        </form>
      </Card>

      <Button href="/" variant="ghost" className="mx-auto">
        На главную
      </Button>
    </div>
  );
}
