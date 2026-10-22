import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type ErrorStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function ErrorState({
  title = "Что-то пошло не так",
  description = "Попробуйте ещё раз. Если проблема останется, обновите страницу или зайдите позже.",
  action,
  className,
}: ErrorStateProps) {
  return (
    <Card
      className={cn(
        "flex flex-col items-center border-danger/40 text-center",
        className,
      )}
      role="alert"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-border bg-card text-danger">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </Card>
  );
}
