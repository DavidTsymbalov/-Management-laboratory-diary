export const EMOJI_BURST_INTERVAL_MS = 300;
export const EMOJI_BURST_DURATION_MS = 3200;
const MAX_PARTICLE_DELAY_MS = 240;
export const EMOJI_BURST_LIFETIME_MS =
  EMOJI_BURST_DURATION_MS + MAX_PARTICLE_DELAY_MS + 80;
const BURST_VARIANTS = ["scatter", "swirl", "fountain"] as const;
export type EmojiBurstVariant = (typeof BURST_VARIANTS)[number];
export function emojiBurstVariant(sequence: number): EmojiBurstVariant {
  return BURST_VARIANTS[sequence % BURST_VARIANTS.length];
}
export function emojiBurstLayout(
  width: number,
  height: number,
  origin: { x: number; y: number },
  variant: EmojiBurstVariant = "scatter",
) {
  const columns = width < height ? 6 : 8;
  const rows = 48 / columns;
  const baseSize = Math.max(48, Math.min(72, Math.min(width, height) * 0.13));
  const margin = (baseSize + 24) / 2 + 4;
  const availableWidth = Math.max(0, width - margin * 2);
  const availableHeight = Math.max(0, height - margin * 2);
  const withinX = (offset: number) =>
    Math.min(width - margin, Math.max(margin, origin.x + offset)) - origin.x;
  const withinY = (offset: number) =>
    Math.min(height - margin, Math.max(margin, origin.y + offset)) - origin.y;
  return Array.from({ length: 48 }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const jitterX = (((index * 17) % 11) - 5) / 25;
    const jitterY = (((index * 23) % 13) - 6) / 30;
    const x = margin + ((column + 0.5 + jitterX) / columns) * availableWidth;
    const y = margin + ((row + 0.5 + jitterY) / rows) * availableHeight;
    const dx = x - origin.x;
    const dy = y - origin.y;
    let viaX = dx * 0.45;
    let viaY = dy * 0.45;
    let midX = dx * 0.82;
    let midY = dy * 0.82;
    let spin = ((index * 37) % 151) - 75;
    if (variant === "swirl") {
      // Curve around the origin before opening into the full-screen spread.
      viaX = (dx * Math.cos(0.95) - dy * Math.sin(0.95)) * 0.45;
      viaY = (dx * Math.sin(0.95) + dy * Math.cos(0.95)) * 0.45;
      midX = (dx * Math.cos(0.28) - dy * Math.sin(0.28)) * 0.82;
      midY = (dx * Math.sin(0.28) + dy * Math.cos(0.28)) * 0.82;
      spin = 90 + ((index * 19) % 121);
    } else if (variant === "fountain") {
      // Lift together, open sideways, then descend into the full-screen spread.
      viaX = dx * 0.38;
      viaY = Math.min(dy * 0.45, -height * (0.28 + (index % 4) * 0.035));
      midY = dy * 0.82 - height * 0.12;
      spin = ((index * 23) % 91) - 45;
    }
    return {
      x: dx,
      y: dy,
      viaX: withinX(viaX),
      viaY: withinY(viaY),
      midX: withinX(midX),
      midY: withinY(midY),
      size: Math.round(baseSize + (index % 5) * 6),
      spin,
      delay: ((index * 7) % 13) * (MAX_PARTICLE_DELAY_MS / 12),
    };
  });
}
