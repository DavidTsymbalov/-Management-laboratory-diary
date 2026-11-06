"use client";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ReactionEmoji } from "@/lib/emoji-reactions";
import {
  emojiBurstLayout,
  EMOJI_BURST_DURATION_MS,
} from "@/lib/emoji-burst-layout";
export type EmojiBurstEvent = {
  id: string;
  emoji: ReactionEmoji;
  x: number;
  y: number;
  width: number;
  height: number;
};
export function EmojiBurst({ event }: { event: EmojiBurstEvent }) {
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
          {event.emoji}
        </span>
      ))}
    </div>,
    document.body,
  );
}
