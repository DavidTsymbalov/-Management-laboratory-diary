type PixelNavDetail = { href: string };

/** Запускает медленный pixel-cover и переход (слушает PixelTransition). */
export function pixelNavigate(href: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PixelNavDetail>("ml-pixel-nav", { detail: { href } }),
  );
}
