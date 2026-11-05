"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PUBLIC_BASE } from "@/lib/public-url";

type Grid = { columns: number; rows: number };
type Phase = "idle" | "cover" | "reveal";

function viewportGrid(): Grid {
  const columns = window.innerWidth < 640 ? 4 : window.innerWidth < 1024 ? 6 : 9;
  return { columns, rows: Math.ceil(window.innerHeight / (window.innerWidth / columns)) };
}

function normalizeHref(href: string) {
  const url = new URL(href, window.location.origin);
  const path = PUBLIC_BASE && (url.pathname === PUBLIC_BASE || url.pathname.startsWith(`${PUBLIC_BASE}/`))
    ? url.pathname.slice(PUBLIC_BASE.length) || "/" : url.pathname;
  return `${path}${url.search}${url.hash}`;
}

function orderFor(count: number) {
  // A stable scattered pattern; every square appears exactly once.
  return Array.from({ length: count }, (_, index) => index)
    .sort((a, b) => Math.sin(a * 127.1 + 31.7) - Math.sin(b * 127.1 + 31.7));
}

export function PixelTransition() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [grid, setGrid] = useState<Grid>({ columns: 9, rows: 6 });
  const [filled, setFilled] = useState<boolean[]>([]);
  const timers = useRef<number[]>([]);
  const pendingHref = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  }, []);

  const go = useCallback((href: string) => {
    const target = normalizeHref(href);
    const current = normalizeHref(window.location.href);
    if (target === current) return;
    clearTimers();
    pendingHref.current = null;
    // Restore the signature mosaic between entry pages; daily workspace actions
    // stay immediate and the first paint is never blocked.
    if ((target.includes("/dashboard") || current.includes("/dashboard")) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("idle");
      router.push(target);
      return;
    }
    const nextGrid = viewportGrid();
    const count = nextGrid.columns * nextGrid.rows;
    const order = orderFor(count);
    const schedule = (fn: () => void, delay: number) => timers.current.push(window.setTimeout(fn, delay));
    const wave = (value: boolean, duration: number) => order.forEach((cell, index) => {
      schedule(() => setFilled((previous) => previous.map((on, i) => i === cell ? value : on)), duration * index / count);
    });
    setGrid(nextGrid);
    setFilled(Array(count).fill(false));
    setPhase("cover");
    pendingHref.current = target;
    wave(true, 220);
    schedule(() => {
      pendingHref.current = null;
      router.push(target);
      setPhase("reveal");
      wave(false, 300);
    }, 260);
    schedule(() => setPhase("idle"), 600);
  }, [clearTimers, router]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return;
      const current = normalizeHref(window.location.href);
      const target = normalizeHref(href);
      // Let Next.js handle workspace links and same-page anchors normally.
      if ((current.includes("/dashboard") || target.includes("/dashboard")) || current === target || url.hash) return;
      event.preventDefault();
      go(href);
    };
    const onPixelNav = (event: Event) => {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href;
      if (href) go(href);
    };
    const onResize = () => {
      clearTimers();
      if (pendingHref.current) router.push(pendingHref.current);
      pendingHref.current = null;
      setPhase("idle");
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("ml-pixel-nav", onPixelNav);
    window.addEventListener("resize", onResize);
    return () => {
      clearTimers();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("ml-pixel-nav", onPixelNav);
      window.removeEventListener("resize", onResize);
    };
  }, [clearTimers, go, router]);

  if (phase === "idle") return null;
  return <div className="pixel-transition" data-phase={phase} aria-hidden="true" style={{
    gridTemplateColumns: `repeat(${grid.columns}, calc(100vw / ${grid.columns}))`,
    gridTemplateRows: `repeat(${grid.rows}, calc(100vw / ${grid.columns}))`,
  }}>
    {filled.map((on, index) => <div key={index} className="pixel-cell" data-on={on ? "1" : "0"} />)}
  </div>;
}
