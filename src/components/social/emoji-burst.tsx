"use client";
import { memo, useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ReactionEmoji } from "@/lib/emoji-reactions";
import {
  emojiBurstLayout,
  EMOJI_BURST_DURATION_MS,
  EMOJI_BURST_LIFETIME_MS,
} from "@/lib/emoji-burst-layout";
export type EmojiBurstEvent = {
  id: string;
  emoji: ReactionEmoji;
  glyph?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export const EmojiBurst = memo(function EmojiBurst({
  event,
  onComplete,
}: {
  event: EmojiBurstEvent;
  onComplete: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(
      () => onComplete(event.id),
      EMOJI_BURST_LIFETIME_MS,
    );
    return () => clearTimeout(timer);
  }, [event.id, onComplete]);
  if (typeof document === "undefined") return null;
  const particles = emojiBurstLayout(event.width, event.height, event);
  return createPortal(
    <div className="emoji-burst" aria-hidden="true">
      {particles.map((particle, index) => (
        <span
          key={index}
          style={
            {
              left: event.x,
              top: event.y,
              "--burst-x": `${particle.x}px`,
              "--burst-y": `${particle.y}px`,
              "--burst-mid-x": `${particle.x * 0.9}px`,
              "--burst-mid-y": `${particle.y * 0.9}px`,
              "--burst-spin": `${particle.spin}deg`,
              "--burst-mid-spin": `${particle.spin * 0.85}deg`,
              "--burst-delay": `${particle.delay}ms`,
              "--burst-size": `${particle.size}px`,
              "--burst-duration": `${EMOJI_BURST_DURATION_MS}ms`,
            } as CSSProperties
          }
        >
          {event.glyph ?? event.emoji}
        </span>
      ))}
    </div>,
    document.body,
  );
});
