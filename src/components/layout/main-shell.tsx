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
        "relative z-10 flex-1",
        !onHome && "pt-20 pb-10 sm:pt-24 sm:pb-14",
      )}
    >
      {children}
    </main>
  );
}
