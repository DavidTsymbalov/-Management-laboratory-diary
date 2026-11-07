"use client";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { EMOJI_REACTIONS, type ReactionEmoji } from "@/lib/emoji-reactions";
export type ChatDisplay = { key: ReactionEmoji; glyph: string; label: string };
export const DEFAULT_CHAT_DISPLAY: ChatDisplay[] = EMOJI_REACTIONS.map(
  (item) => ({ key: item.emoji, glyph: item.emoji, label: item.name }),
);
export function useChatDisplay() {
  const [items, setItems] = useState<ChatDisplay[]>(DEFAULT_CHAT_DISPLAY);
  useEffect(() => {
    let active = true,
      inFlight = false;
    async function load() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const { data, error } = await getSupabase()
          .from("chat_reaction_display")
          .select("key,glyph,label");
        if (active && !error && data?.length === 8) setItems(data);
      } catch {
        /* Keep the last verified display during network outages. */
      } finally {
        inFlight = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 15000);
    const wake = () => void load();
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  return useMemo(() => new Map(items.map((item) => [item.key, item])), [items]);
}
