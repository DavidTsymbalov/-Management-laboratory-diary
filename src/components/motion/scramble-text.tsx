"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CYR = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";

/** 2–3 тика на букву — спокойно, без каши */
const TICK_MS = 42;
const MAX_CYCLES = 3;

function charsetFor(ch: string) {
  if (/[А-Яа-яЁё]/.test(ch)) return CYR;
  return LATIN;
}

function randGlyph(ch: string) {
  const set = charsetFor(ch);
  let g = set[Math.floor(Math.random() * set.length)]!;
  if (g.toLowerCase() === ch.toLowerCase() && set.length > 1) {
    g = set[(Math.floor(Math.random() * set.length))]!;
  }
  if (ch === ch.toLowerCase() && /[A-Za-zА-Яа-яЁё]/.test(ch)) {
    return g.toLowerCase();
  }
  return g;
}

type ScrambleTextProps = {
  text: string;
  className?: string;
  style?: CSSProperties;
  playOnMount?: boolean;
  mountDelayMs?: number;
};

/**
 * Посимвольный scramble с фиксированной шириной каждого символа.
 */
export function ScrambleText({
  text,
  className,
  style,
  playOnMount = false,
  mountDelayMs = 0,
}: ScrambleTextProps) {
  const chars = useMemo(() => Array.from(text), [text]);
  const [live, setLive] = useState<string[] | null>(null);
  const [widths, setWidths] = useState<number[]>(() => chars.map(() => 0));
  const measureRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);
  const busy = useRef(false);
  const shown = live ?? chars;

  const clear = useCallback(() => {
    if (timer.current != null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    busy.current = false;
    setLive(null);
  }, []);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLSpanElement>("[data-m]");
    const next: number[] = [];
    nodes.forEach((node) => next.push(Math.ceil(node.getBoundingClientRect().width)));
    setWidths(next);
  }, [chars]);

  const run = useCallback(() => {
    if (busy.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    busy.current = true;

    const original = Array.from(text);
    let tick = 0;

    timer.current = window.setInterval(() => {
      tick += 1;
      const next = original.map((ch, i) => {
        // Первая буква всегда стабильная
        if (i === 0) return ch;
        if (/[\s·|./:_-]/.test(ch)) return ch;
        const lockAt = Math.floor((i / Math.max(1, original.length)) * MAX_CYCLES);
        if (tick > lockAt + MAX_CYCLES) return ch;
        return randGlyph(ch);
      });
      setLive(next);

      const done = original.every((ch, i) => {
        if (i === 0) return true;
        if (/[\s·|./:_-]/.test(ch)) return true;
        const lockAt = Math.floor((i / Math.max(1, original.length)) * MAX_CYCLES);
        return tick > lockAt + MAX_CYCLES;
      });
      if (done) clear();
    }, TICK_MS);
  }, [clear, text]);

  useEffect(() => {
    if (!playOnMount) return;
    const id = window.setTimeout(run, mountDelayMs);
    return () => window.clearTimeout(id);
  }, [mountDelayMs, playOnMount, run]);

  useEffect(() => () => clear(), [clear]);

  return (
    <span
      className={className}
      style={{ display: "inline-flex", ...style }}
      data-scramble
      onMouseEnter={run}
      onFocus={run}
    >
      <span
        ref={measureRef}
        aria-hidden
        style={{
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
          whiteSpace: "pre",
          display: "inline-flex",
        }}
      >
        {chars.map((ch, i) => (
          <span key={`m-${i}`} data-m>
            {ch === " " ? "\u00a0" : ch}
          </span>
        ))}
      </span>

      {shown.map((ch, i) => (
        <span
          key={`l-${i}`}
          style={{
            display: "inline-block",
            width: widths[i] ? `${widths[i]}px` : undefined,
            textAlign: "center",
            whiteSpace: "pre",
          }}
        >
          {ch === " " ? "\u00a0" : ch}
        </span>
      ))}
    </span>
  );
}
