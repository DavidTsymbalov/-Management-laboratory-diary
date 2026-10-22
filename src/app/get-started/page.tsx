import type { Metadata } from "next";
import { Rocket } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Get started",
};

const steps = [
  "Create a Supabase project and copy the project URL and anon key.",
  "Duplicate .env.example to .env.local and fill in the placeholder values.",
  "Restart the Next.js dev server so environment variables load.",
  "Implement real authentication and database tables in a follow-up task.",
] as const;

export default function GetStartedPage() {
  const configured = isSupabaseConfigured();

  return (
    <Container className="py-12 sm:py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Get started
          </h1>
          <p className="mt-2 text-muted-foreground">
            Set up Management Laboratory for your class. Account creation will use
            Supabase — nothing is stored yet.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Setup checklist</CardTitle>
            <CardDescription>
              Complete these steps before wiring live student data.
            </CardDescription>
          </CardHeader>
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li
                key={step}
                className="flex gap-3 rounded-xl border-2 border-border/10 bg-background/60 px-3 py-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-accent text-sm font-bold">
                  {index + 1}
                </span>
                <p className="text-sm leading-relaxed text-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </Card>

        {configured ? (
          <EmptyState
            icon={<Rocket className="h-5 w-5" aria-hidden />}
            title="Supabase env detected"
            description="Public environment variables are present. Next: implement real sign-up and role-based dashboards without mock authentication."
            action={
              <Button href="/sign-in" variant="secondary">
                Go to sign in
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Rocket className="h-5 w-5" aria-hidden />}
            title="Waiting on environment setup"
            description="Copy .env.example to .env.local and add your Supabase project values. Until then, explore the landing page preview."
            action={
              <Button href="/" variant="secondary">
                Back to home
              </Button>
            }
          />
        )}
      </div>
    </Container>
  );
}
