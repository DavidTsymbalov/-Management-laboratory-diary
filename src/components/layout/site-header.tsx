"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ScrambleText } from "@/components/motion/scramble-text";
import { cn } from "@/lib/cn";
import { isStudentLoggedIn, isTeacherLoggedIn } from "@/lib/session";

const baseLinks = [
  { key: "student", base: "/student/", label: "Ученик" },
  { key: "teacher", base: "/teacher/", label: "Учитель" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const [hrefs, setHrefs] = useState({
    student: "/student/",
    teacher: "/teacher/",
  });

  useEffect(() => {
    const sync = () => {
      setHrefs({
        student: isStudentLoggedIn() ? "/student/dashboard/" : "/student/",
        teacher: isTeacherLoggedIn() ? "/teacher/dashboard/" : "/teacher/",
      });
    };
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [pathname]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        onHome ? "text-[var(--uc-cream)]" : "border-b border-border/60 bg-background/85 text-foreground backdrop-blur-xl",
      )}
    >
      <div className="mx-auto grid h-16 w-full max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <div className="flex items-center">
          <span
            className={cn(
              "inline-block h-3 w-5 border",
              onHome ? "border-[var(--uc-cream)] bg-[var(--uc-cream)]" : "border-foreground bg-foreground",
            )}
            aria-hidden
          />
        </div>

        <Link
          href="/"
          className="btn-text site-logo px-1 text-[0.78rem] uppercase sm:text-sm"
          aria-label="Management Laboratory"
        >
          Management Laboratory
        </Link>

        <nav
          className="flex items-center justify-end gap-1 sm:gap-2"
          aria-label="Навигация"
        >
          {baseLinks.map((link, index) => {
            const href = hrefs[link.key];
            const active =
              pathname === link.base || pathname.startsWith(link.base);
            return (
              <Link
                key={link.key}
                href={href}
                className={cn(
                  "nav-underline hidden px-2 py-2 text-[0.65rem] font-normal uppercase tracking-[0.16em] transition-colors sm:inline-flex",
                  onHome
                    ? active
                      ? "text-[var(--uc-cream)]"
                      : "text-[var(--uc-muted)] hover:text-[var(--uc-cream)]"
                    : active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
                aria-label={link.label}
              >
                <ScrambleText
                  text={link.label}
                  playOnMount
                  mountDelayMs={1100 + index * 120}
                />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
