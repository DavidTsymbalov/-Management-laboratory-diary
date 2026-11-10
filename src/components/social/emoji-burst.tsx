"use client";
import { memo, useEffect, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ReactionEmoji } from "@/lib/emoji-reactions";
import {
  emojiBurstLayout,
  EMOJI_BURST_DURATION_MS,
  EMOJI_BURST_LIFETIME_MS,
  type EmojiBurstVariant,
} from "@/lib/emoji-burst-layout";
export type EmojiBurstEvent = {
  id: string;
  emoji: ReactionEmoji;
  glyph?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  variant: EmojiBurstVariant;
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
  const { width, height, x, y, variant } = event;
  const particles = useMemo(
    () => emojiBurstLayout(width, height, { x, y }, variant),
    [width, height, x, y, variant],
  );
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="emoji-burst" data-variant={variant} aria-hidden="true">
      {particles.map((particle, index) => (
        <span
          key={index}
          style={
            {
              left: event.x,
              top: event.y,
              "--burst-x": `${particle.x}px`,
              "--burst-y": `${particle.y}px`,
              "--burst-via-x": `${particle.viaX}px`,
              "--burst-via-y": `${particle.viaY}px`,
              "--burst-mid-x": `${particle.midX}px`,
              "--burst-mid-y": `${particle.midY}px`,
              "--burst-spin": `${particle.spin}deg`,
              "--burst-via-spin": `${particle.spin * 0.4}deg`,
              "--burst-mid-spin": `${particle.spin * 0.8}deg`,
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
