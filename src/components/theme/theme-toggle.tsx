"use client";

import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/cn";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const onHome = pathname === "/";
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        onHome
          ? "text-[var(--uc-muted)] hover:bg-white/10 hover:text-[var(--uc-cream)]"
          : "text-muted-foreground hover:bg-surface hover:text-foreground",
      )}
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
