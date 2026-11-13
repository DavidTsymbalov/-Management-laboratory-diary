"use client";

import Link from "next/link";
import Image from "next/image";
import { publicUrl } from "@/lib/public-url";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { getCloudRole, signOutCloud, type CloudRole } from "@/lib/cloud-store";
import { getSupabase, cloudError } from "@/lib/supabase";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
import { ScrambleText } from "@/components/motion/scramble-text";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";

const baseLinks = [
  { key: "student", base: "/student/", label: "Ученик" },
  { key: "teacher", base: "/teacher/", label: "Учитель" },
  { key: "admin", base: "/admin/", label: "Админ" },
  { key: "csa", base: "/csa/", label: "CSA" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const onEnrollment = pathname === "/forma" || pathname === "/forma/";
  const router = useRouter();
  const [account, setAccount] = useState<CloudRole | null>(null);
  const [ready, setReady] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  useEffect(() => {
    let active = true,
      inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function sync() {
      if (inFlight) return;
      inFlight = true;
      try {
        const current = await getCloudRole();
        if (active) {
          setAccount(current);
          setReady(true);
        }
      } catch {
        /* Keep login choices hidden until the session can be checked. */
      } finally {
        inFlight = false;
      }
    }
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), 0);
    };
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        if (active) {
          setAccount(null);
          setReady(true);
        }
      } else schedule();
    });
    schedule();
    window.addEventListener("focus", schedule);
    return () => {
      active = false;
      clearTimeout(timer);
      subscription.unsubscribe();
      window.removeEventListener("focus", schedule);
    };
  }, [pathname]);
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOutCloud();
      setAccount(null);
      router.replace("/");
    } catch (error) {
      setFeedback({ type: "error", message: cloudError(error) });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <>
      <header
        className={cn(
          "site-header fixed inset-x-0 top-0 z-50 transition-colors duration-300",
          onHome
            ? "text-[var(--uc-cream)]"
            : "border-b border-border/60 bg-background/85 text-foreground backdrop-blur-xl",
        )}
      >
        <div className="site-header-inner mx-auto grid min-h-24 w-full max-w-[1400px] grid-cols-[auto_1fr] items-center gap-x-3 px-4 sm:h-16 sm:min-h-0 sm:grid-cols-[1fr_auto_1fr] sm:gap-3 sm:px-6 lg:px-10">
          <Link
            href="/"
            className="site-brand-mark"
            aria-label="Главная — Management Laboratory"
          >
            <Image
              className="site-brand-light"
              src={publicUrl("/brand/lbm-light-v3.png")}
              width={48}
              height={48}
              alt="LBM"
              unoptimized
            />
            <Image
              className="site-brand-dark"
              src={publicUrl("/brand/lbm-dark-v3.png")}
              width={48}
              height={48}
              alt="LBM"
              unoptimized
            />
          </Link>

          <Link
            href="/"
            className="btn-text site-logo min-w-0 text-[0.72rem] uppercase sm:text-sm"
            aria-label="Management Laboratory"
          >
            Management Laboratory
          </Link>

          <nav
            className={cn(
              "header-navigation col-span-2 grid w-full items-center gap-2 sm:col-span-1 sm:flex sm:justify-end",
              account || !ready || onEnrollment
                ? "header-account"
                : "header-guest grid-cols-[1fr_1fr_1fr_auto_auto]",
            )}
            aria-label="Навигация"
          >
            {ready &&
              !account &&
              !onEnrollment &&
              baseLinks.map((link, index) => {
                const href = link.base;
                const active =
                  pathname === link.base || pathname.startsWith(link.base);
                return (
                  <Link
                    key={link.key}
                    href={href}
                    className={cn(
                      "nav-underline min-h-11 justify-center px-2 py-2 text-xs font-normal uppercase tracking-[0.12em] transition-colors sm:min-h-0 sm:text-[0.65rem] sm:tracking-[0.16em]",
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
            {account && (
              <>
                <Link
                  className="header-account-link"
                  href={
                    account.requiresMfa
                      ? `/${account.role}/`
                      : account.role === "csa"
                        ? "/csa/dashboard/"
                        : account.role === "teacher"
                          ? "/teacher/dashboard/"
                          : "/student/dashboard/"
                  }
                >
                  {account.requiresMfa
                    ? "Подтвердить вход"
                    : account.role === "csa"
                      ? "CSA"
                      : account.role === "teacher"
                        ? "Кабинет"
                        : "Мой дневник"}
                </Link>
                {account.role === "admin" && (
                  <Link
                    className="header-account-link"
                    href="/admin/dashboard/"
                  >
                    Класс
                  </Link>
                )}
                <button
                  className="header-icon-button"
                  type="button"
                  disabled={loggingOut}
                  aria-label="Выйти из аккаунта"
                  onClick={() => void logout()}
                >
                  <LogOut size={17} aria-hidden="true" />
                </button>
              </>
            )}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </>
  );
}
