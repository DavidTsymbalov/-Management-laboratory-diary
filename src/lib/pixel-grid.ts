/** Every cell has the same width and height, including portrait phones. */
export function squarePixelGrid(width: number, height: number) {
  const columns = width < 640 ? 4 : width < 1024 ? 6 : 9;
  const cell = width / columns;
  return { columns, rows: Math.ceil(height / cell), cell };
}
export function pixelOrder(count: number) {
  const order = Array.from({ length: count }, (_, index) => index).sort(
    (a, b) => Math.sin(a * 127.1 + 31.7) - Math.sin(b * 127.1 + 31.7),
  );
  const ranks = Array<number>(count);
  order.forEach((cell, rank) => {
    ranks[cell] = rank;
  });
  return ranks;
}
