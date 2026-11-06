import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-11 w-full min-w-0 rounded-none border-0 border-b border-[rgb(229_218_195/0.35)] bg-transparent px-0 text-base text-[#e5dac3] sm:text-sm",
        "placeholder:text-[#e5dac3]/45",
        "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
