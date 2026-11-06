"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { pixelOrder, squarePixelGrid } from "@/lib/pixel-grid";
export type Theme = "light" | "dark";
type ThemeContextValue = {
  theme: Theme;
  changing: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};
type Mosaic = {
  next: Theme;
  phase: "cover" | "reveal";
  columns: number;
  rows: number;
};
const STORAGE_KEY = "ml-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#080a0d" : "#ffffff");
}
function domTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
function ThemeMosaic({ mosaic }: { mosaic: Mosaic }) {
  const count = mosaic.columns * mosaic.rows;
  const ranks = pixelOrder(count);
  return (
    <div
      className="theme-mosaic"
      data-phase={mosaic.phase}
      aria-hidden="true"
      style={
        {
          gridTemplateColumns: `repeat(${mosaic.columns},calc(100vw / ${mosaic.columns}))`,
          gridAutoRows: `calc(100vw / ${mosaic.columns})`,
          "--theme-tile": mosaic.next === "dark" ? "#080a0d" : "#ffffff",
        } as CSSProperties
      }
    >
      {ranks.map((rank, index) => (
        <span
          key={index}
          style={
            {
              "--tile-delay": `${(rank / Math.max(1, count - 1)) * 240}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mosaic, setMosaic] = useState<Mosaic | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pending = useRef<Theme | null>(null);
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const commit = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* theme still works without storage */
    }
  }, []);
  const finish = useCallback(() => {
    clear();
    if (pending.current) commit(pending.current);
    pending.current = null;
    setMosaic(null);
    document.documentElement.removeAttribute("data-theme-transition");
  }, [clear, commit]);
  useEffect(() => {
    let next = domTheme();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "dark" || stored === "light") next = stored;
    } catch {
      /* use rendered theme */
    }
    const timer = setTimeout(() => {
      applyTheme(next);
      setThemeState(next);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (pending.current) finish();
    };
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("resize", stop);
    document.addEventListener("visibilitychange", hidden);
    media.addEventListener("change", stop);
    return () => {
      clear();
      window.removeEventListener("resize", stop);
      document.removeEventListener("visibilitychange", hidden);
      media.removeEventListener("change", stop);
      document.documentElement.removeAttribute("data-theme-transition");
    };
  }, [clear, finish]);
  const setTheme = useCallback(
    (next: Theme) => {
      if (pending.current || next === domTheme()) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        commit(next);
        return;
      }
      const grid = squarePixelGrid(window.innerWidth, window.innerHeight);
      pending.current = next;
      document.documentElement.setAttribute("data-theme-transition", "1");
      setMosaic({
        next,
        phase: "cover",
        columns: grid.columns,
        rows: grid.rows,
      });
      timers.current.push(
        setTimeout(() => {
          commit(next);
          setMosaic({
            next,
            phase: "reveal",
            columns: grid.columns,
            rows: grid.rows,
          });
        }, 280),
      );
      timers.current.push(setTimeout(finish, 580));
    },
    [commit, finish],
  );
  const toggleTheme = useCallback(
    () => setTheme(domTheme() === "dark" ? "light" : "dark"),
    [setTheme],
  );
  const value = useMemo(
    () => ({ theme, changing: mosaic !== null, setTheme, toggleTheme }),
    [theme, mosaic, setTheme, toggleTheme],
  );
  return (
    <ThemeContext.Provider value={value}>
      {children}
      {mosaic && <ThemeMosaic mosaic={mosaic} />}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
