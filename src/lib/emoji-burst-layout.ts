export const EMOJI_BURST_DURATION_MS = 3600;
export const EMOJI_BURST_LIFETIME_MS = 4200;
export function emojiBurstLayout(
  width: number,
  height: number,
  origin: { x: number; y: number },
) {
  const columns = width < height ? 6 : 8;
  const rows = 48 / columns;
  const baseSize = Math.max(48, Math.min(72, Math.min(width, height) * 0.13));
  const margin = (baseSize + 24) / 2 + 4;
  const availableWidth = Math.max(0, width - margin * 2);
  const availableHeight = Math.max(0, height - margin * 2);
  return Array.from({ length: 48 }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const jitterX = (((index * 17) % 11) - 5) / 25;
    const jitterY = (((index * 23) % 13) - 6) / 30;
    const x = margin + ((column + 0.5 + jitterX) / columns) * availableWidth;
    const y = margin + ((row + 0.5 + jitterY) / rows) * availableHeight;
    return {
      x: x - origin.x,
      y: y - origin.y,
      size: Math.round(baseSize + (index % 5) * 6),
      spin: ((index * 37) % 151) - 75,
      delay: ((index * 7) % 13) * 40,
    };
  });
}
