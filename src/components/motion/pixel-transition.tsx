"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const COLS = 9;
const ROWS = 6;
const CELL_COUNT = COLS * ROWS;

const COVER_MS = 1100;
const HOLD_MS = 420;
const HOLD_AFTER_NAV_MS = 320;
const REVEAL_MS = 1150;
const BOOT_HOLD_MS = 650;

type Phase = "idle" | "cover" | "hold" | "reveal";

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledOrder(seed: number) {
  const rnd = mulberry32(seed);
  const order = Array.from({ length: CELL_COUNT }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

function mosaicTracks(count: number, seed: number) {
  const rnd = mulberry32(seed);
  const weights = Array.from({ length: count }, () => 0.55 + rnd() * 1.1);
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => `${((w / sum) * 100).toFixed(3)}%`).join(" ");
}

function allOn(value: boolean) {
  return Array.from({ length: CELL_COUNT }, () => value);
}

function normalizeHref(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

export function PixelTransition() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("hold");
  const [filled, setFilled] = useState<boolean[]>(() => allOn(true));
  const pendingHref = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const busyRef = useRef(false);
  const revealRef = useRef<() => void>(() => undefined);
  const bootedRef = useRef(false);

  const orderCover = useMemo(() => shuffledOrder(0xc0ffee), []);
  const orderReveal = useMemo(() => shuffledOrder(0xbadc0de), []);
  const colTracks = useMemo(() => mosaicTracks(COLS, 0x1111), []);
  const rowTracks = useMemo(() => mosaicTracks(ROWS, 0x2222), []);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  const paintWave = useCallback(
    (toOn: boolean, order: number[], totalMs: number) => {
      let i = 0;
      while (i < order.length) {
        const batch = i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1;
        const at = Math.round((i / CELL_COUNT) * totalMs);
        const slice = order.slice(i, i + batch);
        schedule(() => {
          setFilled((prev) => {
            const next = prev.slice();
            for (const idx of slice) next[idx] = toOn;
            return next;
          });
        }, at);
        i += batch;
      }
    },
    [schedule],
  );

  const goIdle = useCallback(() => {
    busyRef.current = false;
    setPhase("idle");
    setFilled(allOn(false));
  }, []);

  const runReveal = useCallback(() => {
    clearTimers();
    busyRef.current = true;
    setPhase("reveal");
    setFilled(allOn(true));
    schedule(() => paintWave(false, orderReveal, REVEAL_MS), 40);
    schedule(goIdle, REVEAL_MS + 180);
  }, [clearTimers, goIdle, orderReveal, paintWave, schedule]);

  useEffect(() => {
    revealRef.current = runReveal;
  }, [runReveal]);

  const coverThenGo = useCallback(
    (href: string) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        router.push(href);
        return;
      }

      const target = normalizeHref(href);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (target === current) return;

      // не блокируем навсегда, если предыдущий цикл завис
      if (busyRef.current) {
        clearTimers();
        busyRef.current = false;
      }

      clearTimers();
      busyRef.current = true;
      pendingHref.current = target;
      setPhase("cover");
      setFilled(allOn(false));
      schedule(() => paintWave(true, orderCover, COVER_MS), 40);

      schedule(() => {
        setPhase("hold");
        setFilled(allOn(true));
        schedule(() => {
          const next = pendingHref.current;
          pendingHref.current = null;
          if (!next) {
            goIdle();
            return;
          }
          router.push(next);
          schedule(() => revealRef.current(), HOLD_AFTER_NAV_MS);
        }, HOLD_MS);
      }, COVER_MS + 80);
    },
    [clearTimers, goIdle, orderCover, paintWave, router, schedule],
  );

  // Boot: чёрный экран → пауза → пиксели уходят
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      goIdle();
      return;
    }

    busyRef.current = true;
    setPhase("hold");
    setFilled(allOn(true));

    const open = window.setTimeout(() => {
      revealRef.current();
    }, BOOT_HOLD_MS);

    // safety: никогда не держим busy вечно
    const safety = window.setTimeout(() => {
      busyRef.current = false;
    }, BOOT_HOLD_MS + REVEAL_MS + 2000);

    return () => {
      window.clearTimeout(open);
      window.clearTimeout(safety);
      // Strict Mode: разрешаем boot на втором mount
      bootedRef.current = false;
    };
  }, [goIdle]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;

      const next = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next === current) return;

      event.preventDefault();
      coverThenGo(next);
    }

    function onPixelNav(event: Event) {
      const detail = (event as CustomEvent<{ href: string }>).detail;
      if (!detail?.href) return;
      coverThenGo(detail.href);
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("ml-pixel-nav", onPixelNav);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("ml-pixel-nav", onPixelNav);
    };
  }, [coverThenGo]);

  if (phase === "idle") return null;

  return (
    <div
      className="pixel-transition"
      data-phase={phase}
      style={{
        gridTemplateColumns: colTracks,
        gridTemplateRows: rowTracks,
      }}
      aria-hidden
    >
      {filled.map((on, index) => (
        <div key={index} className="pixel-cell" data-on={on ? "1" : "0"} />
      ))}
    </div>
  );
}
