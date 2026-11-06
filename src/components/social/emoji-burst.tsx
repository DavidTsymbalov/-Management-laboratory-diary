"use client";
import type { CSSProperties } from "react";
import type { ReactionEmoji } from "@/lib/emoji-reactions";
export type EmojiBurstEvent = {
  id: string;
  emoji: ReactionEmoji;
  x: number;
  y: number;
};
export function EmojiBurst({ event }: { event: EmojiBurstEvent }) {
  return (
    <div className="emoji-burst" aria-hidden="true">
      {Array.from({ length: 24 }, (_, index) => {
        const angle = -Math.PI + (index / 23) * Math.PI;
        const distance = 110 + ((index * 47) % 190);
        return (
          <span
            key={index}
            style={
              {
                left: event.x,
                top: event.y,
                "--burst-x": `${Math.cos(angle) * distance}px`,
                "--burst-y": `${Math.sin(angle) * distance - 90}px`,
                "--burst-spin": `${(index % 2 ? 1 : -1) * (30 + index * 17)}deg`,
                "--burst-delay": `${(index % 5) * 22}ms`,
                "--burst-size": `${26 + (index % 4) * 7}px`,
              } as CSSProperties
            }
          >
            {event.emoji}
          </span>
        );
      })}
    </div>
  );
}
