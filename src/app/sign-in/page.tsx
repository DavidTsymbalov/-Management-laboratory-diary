import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  const configured = isSupabaseConfigured();

  return (
    <Container className="py-12 sm:py-16">
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-2 text-muted-foreground">
            Access your Management Laboratory account when authentication is connected.
          </p>
        </div>

        {configured ? (
          <Card>
            <CardHeader>
              <CardTitle>Ready for Supabase auth</CardTitle>
              <CardDescription>
                Environment variables are set. Wire up the auth flow in a later task —
                no fake sign-in is implemented here.
              </CardDescription>
            </CardHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@school.edu"
                  disabled
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  disabled
                />
              </div>
              <Button type="button" disabled className="w-full">
                Sign in (coming soon)
              </Button>
            </div>
          </Card>
        ) : (
          <EmptyState
            icon={<KeyRound className="h-5 w-5" aria-hidden />}
            title="Authentication not configured"
            description="Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local to prepare Supabase sign-in. See .env.example for the variable names."
            action={
              <Button href="/get-started" variant="secondary">
                View setup steps
              </Button>
            }
          />
        )}
      </div>
    </Container>
  );
}
