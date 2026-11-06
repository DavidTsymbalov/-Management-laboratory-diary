"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, cloudError } from "@/lib/supabase";
import { loadHomework, type Homework } from "@/lib/homework";
export function useHomework(archived = false) {
  const [snapshot, setSnapshot] = useState<{
    archived: boolean;
    items: Homework[];
    ready: boolean;
    error: string | null;
  }>({ archived, items: [], ready: false, error: null });
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
            const rows = await loadHomework(archived);
            if (!alive) return;
            setSnapshot({ archived, items: rows, ready: true, error: null });
          } catch (reason) {
            if (alive)
              setSnapshot((current) => ({
                archived,
                items: current.archived === archived ? current.items : [],
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
    const timer = setInterval(wake, 15000);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    const client = getSupabase();
    const channel = client
      .channel(
        `homework-${archived ? "archive" : "current"}-${crypto.randomUUID()}`,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classroom_homework" },
        wake,
      )
      .subscribe();
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
      void client.removeChannel(channel);
    };
  }, [archived]);
  const refresh = useCallback(async () => {
    await syncRef.current();
  }, []);
  return snapshot.archived === archived
    ? { ...snapshot, refresh }
    : { items: [], ready: false, error: null, refresh };
}
