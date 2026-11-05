"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function MainShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onHome = pathname === "/";

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        "main-shell relative min-w-0 flex-1",
        !onHome && "workspace z-10",
      )}
    >
      {children}
    </main>
  );
}
