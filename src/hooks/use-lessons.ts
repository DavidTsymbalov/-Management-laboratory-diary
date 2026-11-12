"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadLessons } from "@/lib/lesson-store";
import { cloudError } from "@/lib/supabase";
import type { ClassroomLesson } from "@/lib/lesson-materials";
export function useLessons(month: string) {
  const [snapshot, setSnapshot] = useState<{
    month: string;
    items: ClassroomLesson[];
    ready: boolean;
    error: string | null;
  }>({ month, items: [], ready: false, error: null });
  const syncRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let alive = true,
      again = false;
    let running: Promise<void> | null = null;
    function sync(): Promise<void> {
      if (!alive || document.hidden) return Promise.resolve();
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        do {
          again = false;
          try {
            const items = await loadLessons(month);
            if (alive) setSnapshot({ month, items, ready: true, error: null });
          } catch (reason) {
            if (alive)
              setSnapshot((current) => ({
                month,
                items: current.month === month ? current.items : [],
                ready: true,
                error: cloudError(reason),
              }));
          }
        } while (alive && again && !document.hidden);
      })().finally(() => {
        running = null;
      });
      return running;
    }
    syncRef.current = sync;
    void sync();
    const wake = () => {
      void sync();
    };
    const timer = setInterval(wake, 30000);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [month]);
  const refresh = useCallback(() => syncRef.current(), []);
  return snapshot.month === month
    ? { ...snapshot, refresh }
    : { items: [], ready: false, error: null, refresh };
}
