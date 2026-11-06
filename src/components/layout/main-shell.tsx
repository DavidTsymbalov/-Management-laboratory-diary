"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function MainShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onHome = pathname === "/";

  return (
    <main
      className={cn(
        // без z-index на главной: иначе fixed-слоган «запирается» под пикселями
        "main-shell relative min-w-0 flex-1",
        !onHome && "z-10 pt-32 pb-10 sm:pt-24 sm:pb-14",
      )}
    >
      {children}
    </main>
  );
}
