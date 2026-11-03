"use client";

import { useEffect, useMemo, useState } from "react";

const LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TICK_MS = 28;
const CYCLES = 5;

type WordSpec = {
  text: string;
  className: string;
  delayMs: number;
};

const WORDS: WordSpec[] = [
  {
    text: "MANAGEMENT",
    className: "home-intro-word home-intro-word-a",
    delayMs: 180,
  },
  {
    text: "LABORATORY",
    className: "home-intro-word home-intro-word-b",
    delayMs: 420,
  },
  {
    text: "DIARY",
    className: "home-intro-word home-intro-word-c",
    delayMs: 660,
  },
];

function scrambleWord(
  text: string,
  onFrame: (chars: string[]) => void,
  onDone: () => void,
) {
  const original = Array.from(text);
  let tick = 0;
  const id = window.setInterval(() => {
    tick += 1;
    const next = original.map((ch, i) => {
      if (ch === " ") return ch;
      const lockAt = Math.floor((i / Math.max(1, original.length)) * CYCLES);
      if (tick > lockAt + CYCLES) return ch;
      return LATIN[Math.floor(Math.random() * LATIN.length)]!;
    });
    onFrame(next);
    const done = original.every((ch, i) => {
      if (ch === " ") return true;
      const lockAt = Math.floor((i / Math.max(1, original.length)) * CYCLES);
      return tick > lockAt + CYCLES;
    });
    if (done) {
      window.clearInterval(id);
      onFrame(original);
      onDone();
    }
  }, TICK_MS);
  return () => window.clearInterval(id);
}

function IntroWord({
  text,
  className,
  delayMs,
  active,
}: WordSpec & { active: boolean }) {
  const chars = useMemo(() => Array.from(text), [text]);
  const [live, setLive] = useState<string[] | null>(null);

  useEffect(() => {
    if (!active) return;
    let stop: (() => void) | undefined;
    const start = window.setTimeout(() => {
      stop = scrambleWord(text, setLive, () => undefined);
    }, delayMs);
    return () => {
      window.clearTimeout(start);
      stop?.();
    };
  }, [active, delayMs, text]);

  const shown = live ?? chars.map(() => "\u00a0");

  return (
    <span className={className} aria-hidden>
      {shown.map((ch, i) => (
        <span key={i} className="home-intro-glyph">
          {ch === " " ? "\u00a0" : ch}
        </span>
      ))}
    </span>
  );
}

/**
 * Интро как на референсе: чёрный экран → scramble-слова по углам → растворение.
 */
export function HomeIntro() {
  const [phase, setPhase] = useState<"run" | "out" | "gone">("run");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() => setPhase("gone"));
      return () => window.cancelAnimationFrame(frame);
    }

    document.documentElement.dataset.homeIntro = "1";
    const hold = window.setTimeout(() => setPhase("out"), 2600);
    const end = window.setTimeout(() => {
      setPhase("gone");
      delete document.documentElement.dataset.homeIntro;
    }, 3200);

    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(end);
      delete document.documentElement.dataset.homeIntro;
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className="home-intro"
      data-phase={phase}
      aria-hidden
      role="presentation"
    >
      <div className="home-intro-stage">
        {WORDS.map((word) => (
          <IntroWord key={word.text} {...word} active />
        ))}
      </div>
    </div>
  );
}
