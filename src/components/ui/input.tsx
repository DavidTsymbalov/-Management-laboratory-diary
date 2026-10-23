import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-sm border border-border bg-card px-3.5 text-sm text-[#e5dac3]",
        "placeholder:text-[#e5dac3]/45",
        "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
