"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, cloudError } from "@/lib/supabase";
import { loadEmojiState } from "@/lib/emoji-chat";
import type { EmojiMessage, EmojiPeer } from "@/lib/emoji-reactions";
export function useEmojiInbox(
  studentId: string,
  onIncoming: (
    messages: EmojiMessage[],
    peers: EmojiPeer[],
    changes: EmojiMessage[],
  ) => void,
) {
  const [peers, setPeers] = useState<EmojiPeer[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callback = useRef(onIncoming);
  const syncRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    callback.current = onIncoming;
  }, [onIncoming]);
  useEffect(() => {
    let active = true,
      inFlight = false;
    let cursor: number | null = null;
    let changeCursor: number | null = null;
    async function sync() {
      if (!active || document.hidden || inFlight) return;
      inFlight = true;
      try {
        const snapshot = await loadEmojiState(cursor, changeCursor);
        if (!active) return;
        cursor = snapshot.cursor;
        changeCursor = snapshot.change_cursor ?? 0;
        setPeers(snapshot.peers);
        setReady(true);
        setError(null);
        if (snapshot.incoming.length || snapshot.changes?.length)
          callback.current(
            snapshot.incoming,
            snapshot.peers,
            snapshot.changes ?? [],
          );
      } catch (reason) {
        if (active) {
          setError(cloudError(reason));
          setReady(true);
        }
      } finally {
        inFlight = false;
      }
    }
    syncRef.current = sync;
    void sync();
    const wake = () => {
      void sync();
    };
    const timer = setInterval(wake, 3000);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    const client = getSupabase();
    const channel = client
      .channel(`pupil-emoji-inbox-${studentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "student_emoji_messages",
          filter: `recipient_id=eq.${studentId}`,
        },
        wake,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "student_emoji_messages",
          filter: `recipient_id=eq.${studentId}`,
        },
        wake,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "student_emoji_messages",
          filter: `sender_id=eq.${studentId}`,
        },
        wake,
      )
      .subscribe();
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
      void client.removeChannel(channel);
    };
  }, [studentId]);
  const refresh = useCallback(async () => {
    await syncRef.current();
  }, []);
  return { peers, setPeers, ready, error, refresh };
}
