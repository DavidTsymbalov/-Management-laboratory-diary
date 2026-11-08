"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PUBLIC_BASE } from "@/lib/public-url";

type PixelGrid = { columns: number; rows: number };

function viewportGrid(): PixelGrid {
  if (typeof window === "undefined") return { columns: 9, rows: 6 };
  const columns = window.innerWidth < 640 ? 4 : window.innerWidth < 1024 ? 6 : 9;
  return { columns, rows: Math.ceil(window.innerHeight / (window.innerWidth / columns)) };
}

const COVER_MS = 360;
const HOLD_MS = 60;
const HOLD_AFTER_NAV_MS = 140;
const REVEAL_MS = 400;
const BOOT_HOLD_MS = 650;
const BOOT_REVEAL_MS = 1150;
/** Сколько едет текст слева/справа (должно ≥ CSS animation) */
const INTRO_SLIDE_MS = 2300;
/** Пауза уже сложившимся текстом — только потом пиксели */
const INTRO_HOLD_MS = 850;

type Phase = "boot" | "idle" | "intro" | "cover" | "hold" | "reveal";

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

function shuffledOrder(seed: number, count: number) {
  const rnd = mulberry32(seed);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

function allOn(value: boolean, count: number) {
  return Array.from({ length: count }, () => value);
}

function normalizeHref(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    // DOM links already contain basePath; Next's router adds it itself.
    const path = PUBLIC_BASE &&
      (url.pathname === PUBLIC_BASE || url.pathname.startsWith(`${PUBLIC_BASE}/`))
      ? url.pathname.slice(PUBLIC_BASE.length) || "/"
      : url.pathname;
    return `${path}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function isHomePath(path: string) {
  return path === "/" || path === "" ||
    (Boolean(PUBLIC_BASE) && (path === PUBLIC_BASE || path === `${PUBLIC_BASE}/`));
}

export function PixelTransition() {
  const router = useRouter();
  const pathname = usePathname();
  // Boot renders a solid layer on both server and client, before any grid cells.
  const [grid, setGrid] = useState<PixelGrid>(viewportGrid);
  const cellCount = grid.columns * grid.rows;
  const [phase, setPhase] = useState<Phase>("boot");
  const [filled, setFilled] = useState<boolean[]>(() => allOn(true, cellCount));
  /** Текст интро рисуем в этом же слое (над пикселями), чтобы его было видно */
  const [showIntroCopy, setShowIntroCopy] = useState(false);
  /** После пикселей оставляем тот же слоган — без сброса на дубль в hero */
  const [homeSloganLive, setHomeSloganLive] = useState(false);
  const pendingHref = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const busyRef = useRef(false);
  const revealRef = useRef<(initial?: boolean) => void>(() => undefined);
  const bootedRef = useRef(false);
  const homeIntroRef = useRef(false);
  const cellCountRef = useRef(cellCount);
  const goIdleRef = useRef<() => void>(() => undefined);

  const orderCover = useMemo(() => shuffledOrder(0xc0ffee, cellCount), [cellCount]);
  const orderReveal = useMemo(() => shuffledOrder(0xbadc0de, cellCount), [cellCount]);

  useEffect(() => {
    // Finish the current wave before changing its cell count. CSS keeps cells
    // square during a resize; the next wave uses the new viewport dimensions.
    if (phase !== "idle") return;
    let frame = 0;
    const resize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next = viewportGrid();
        setGrid((previous) => previous.columns === next.columns && previous.rows === next.rows ? previous : next);
        setFilled(allOn(false, next.columns * next.rows));
      });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [phase]);

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
        const at = Math.round((i / cellCount) * totalMs);
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
    [cellCount, schedule],
  );

  const markIntroDone = useCallback(() => {
    document.documentElement.removeAttribute("data-ml-intro");
  }, []);

  const clearHomeSlogan = useCallback(() => {
    homeIntroRef.current = false;
    setHomeSloganLive(false);
    setShowIntroCopy(false);
    document.documentElement.removeAttribute("data-ml-slogan-live");
  }, []);

  const goIdle = useCallback(() => {
    busyRef.current = false;
    markIntroDone();
    setFilled(allOn(false, cellCount));
    setPhase("idle");
    // На главной оставляем тот же слой слогана — иначе «сброс» раскладки
    if (homeIntroRef.current) {
      setShowIntroCopy(true);
      setHomeSloganLive(true);
      document.documentElement.setAttribute("data-ml-slogan-live", "1");
      return;
    }
    setShowIntroCopy(false);
    setHomeSloganLive(false);
  }, [cellCount, markIntroDone]);

  useEffect(() => {
    cellCountRef.current = cellCount;
    goIdleRef.current = goIdle;
  }, [cellCount, goIdle]);

  const runReveal = useCallback((initial = false) => {
    const duration = initial ? BOOT_REVEAL_MS : REVEAL_MS;
    clearTimers();
    busyRef.current = true;
    setPhase("reveal");
    setFilled(allOn(true, cellCount));
    schedule(() => paintWave(false, orderReveal, duration), initial ? 40 : 16);
    schedule(goIdle, duration + (initial ? 180 : 48));
  }, [cellCount, clearTimers, goIdle, orderReveal, paintWave, schedule]);

  useEffect(() => {
    revealRef.current = runReveal;
  }, [runReveal]);

  const coverThenGo = useCallback(
    (href: string) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        router.push(normalizeHref(href));
        return;
      }

      const target = normalizeHref(href);
      const current = normalizeHref(window.location.href);
      if (target === current) return;

      if (busyRef.current) {
        clearTimers();
        busyRef.current = false;
      }

      clearTimers();
      busyRef.current = true;
      pendingHref.current = target;
      clearHomeSlogan();
      setPhase("cover");
      setFilled(allOn(false, cellCount));
      schedule(() => paintWave(true, orderCover, COVER_MS), 16);

      schedule(() => {
        setPhase("hold");
        setFilled(allOn(true, cellCount));
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
      }, COVER_MS + 32);
    },
    [cellCount, clearHomeSlogan, clearTimers, goIdle, orderCover, paintWave, router, schedule],
  );

  // Boot: на главной — пиксели ждут, пока слоган сложится; иначе сразу пиксели
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() => goIdleRef.current());
      return () => {
        window.cancelAnimationFrame(frame);
        bootedRef.current = false;
      };
    }

    busyRef.current = true;
    const home = isHomePath(window.location.pathname);

    if (home) {
      homeIntroRef.current = true;
      document.documentElement.setAttribute("data-ml-intro", "1");
      const frame = window.requestAnimationFrame(() => {
        setShowIntroCopy(true);
        setPhase("intro");
        setFilled(allOn(true, cellCountRef.current));
      });

      const toPixels = window.setTimeout(() => {
        setPhase("hold");
        setFilled(allOn(true, cellCountRef.current));
        schedule(() => revealRef.current(true), 220);
      }, INTRO_SLIDE_MS + INTRO_HOLD_MS);

      const safety = window.setTimeout(() => {
        busyRef.current = false;
        markIntroDone();
      }, INTRO_SLIDE_MS + INTRO_HOLD_MS + BOOT_REVEAL_MS + 2500);

      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(toPixels);
        window.clearTimeout(safety);
        bootedRef.current = false;
      };
    }

    markIntroDone();
    const frame = window.requestAnimationFrame(() => {
      setPhase("hold");
      setFilled(allOn(true, cellCountRef.current));
    });

    const open = window.setTimeout(() => {
      revealRef.current(true);
    }, BOOT_HOLD_MS);

    const safety = window.setTimeout(() => {
      busyRef.current = false;
    }, BOOT_HOLD_MS + BOOT_REVEAL_MS + 2000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(open);
      window.clearTimeout(safety);
      bootedRef.current = false;
    };
  }, [markIntroDone, schedule]);

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

  useEffect(() => {
    if (!isHomePath(pathname)) {
      markIntroDone();
      const frame = window.requestAnimationFrame(clearHomeSlogan);
      return () => window.cancelAnimationFrame(frame);
    }
  }, [pathname, clearHomeSlogan, markIntroDone]);

  const sloganNode = showIntroCopy ? (
    <div
      className="pixel-intro-copy"
      data-settled={homeSloganLive || phase === "hold" || phase === "reveal" ? "1" : "0"}
    >
      <span className="pixel-intro-line pixel-intro-from-left">Management</span>
      <span className="pixel-intro-line pixel-intro-line-2 pixel-intro-from-right">
        laboratory
      </span>
      <span className="pixel-intro-line pixel-intro-line-3 pixel-intro-from-left pixel-intro-delay">
        diary
      </span>
    </div>
  ) : null;

  if (phase === "idle") {
    if (!homeSloganLive) return null;
    return (
      <div className="pixel-transition pixel-slogan-live" data-phase="idle" aria-hidden>
        {sloganNode}
      </div>
    );
  }

  const solidOnly = phase === "boot" || phase === "intro";
  const showMosaic = phase === "cover" || phase === "hold" || phase === "reveal";

  return (
    <div
      className="pixel-transition"
      data-phase={phase}
      style={
        showMosaic
          ? {
              gridTemplateColumns: `repeat(${grid.columns}, calc(100vw / ${grid.columns}))`,
              gridTemplateRows: `repeat(${grid.rows}, calc(100vw / ${grid.columns}))`,
            }
          : undefined
      }
      aria-hidden
    >
      {solidOnly ? <div className="pixel-intro-solid" /> : null}
      {showMosaic
        ? filled.map((on, index) => (
            <div key={index} className="pixel-cell" data-on={on ? "1" : "0"} />
          ))
        : null}
      {sloganNode}
    </div>
  );
}
