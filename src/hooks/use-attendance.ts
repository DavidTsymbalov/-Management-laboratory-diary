"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, cloudError } from "@/lib/supabase";
import { loadAttendance } from "@/lib/attendance-store";
import type { AttendanceSnapshot } from "@/lib/attendance";
export function useAttendance(month: string) {
  const [snapshot, setSnapshot] = useState<{
    month: string;
    data: AttendanceSnapshot;
    ready: boolean;
    error: string | null;
  }>({ month, data: { lessons: [], records: [] }, ready: false, error: null });
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
            const rows = await loadAttendance(month);
            if (!alive) return;
            setSnapshot({ month, data: rows, ready: true, error: null });
          } catch (reason) {
            if (alive)
              setSnapshot((current) => ({
                month,
                data:
                  current.month === month
                    ? current.data
                    : { lessons: [], records: [] },
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
      .channel(`attendance-${month}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_lessons" },
        wake,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_records" },
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
  }, [month]);
  const refresh = useCallback(async () => {
    await syncRef.current();
  }, []);
  const update = useCallback(
    (change: (data: AttendanceSnapshot) => AttendanceSnapshot) => {
      setSnapshot((current) =>
        current.month === month
          ? { ...current, data: change(current.data) }
          : current,
      );
    },
    [month],
  );
  return snapshot.month === month
    ? { ...snapshot, refresh, update }
    : {
        data: { lessons: [], records: [] },
        ready: false,
        error: null,
        refresh,
        update,
      };
}
