/** Prefix for GitHub Pages project URL. Empty in local / FTP root deploy. */
export const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function publicUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${PUBLIC_BASE}${normalized}`;
}
