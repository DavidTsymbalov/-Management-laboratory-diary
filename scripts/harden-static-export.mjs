import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
export function hardenHtml(
  html,
  apiUrl = "https://pnpanexhudlalavcevck.supabase.co",
) {
  const api = new URL(apiUrl);
  if (api.protocol !== "https:")
    throw new Error("Production Supabase must use HTTPS");
  const hashes = [
    ...new Set(
      [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter((match) => !/\bsrc\s*=/i.test(match[1]) && match[2])
        .map(
          (match) =>
            `'sha256-${createHash("sha256").update(match[2]).digest("base64")}'`,
        ),
    ),
  ];
  const policy = [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(" ")}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${api.origin} wss://${api.host}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
  if (!/<head\b[^>]*>/i.test(html)) throw new Error("Missing HTML head");
  return html
    .replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/gi, "")
    .replace(
      /<head\b[^>]*>(\s*<meta\s+charset=[^>]*>)?/i,
      (head, charset) =>
        `${head}${charset ? "" : '<meta charset="utf-8"/>'}<meta http-equiv="Content-Security-Policy" content="${policy.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"/>`,
    );
}
async function hardenDir(dir) {
  let count = 0;
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, item.name);
    if (item.isDirectory()) count += await hardenDir(file);
    else if (item.name.endsWith(".html")) {
      await writeFile(
        file,
        hardenHtml(
          await readFile(file, "utf8"),
          process.env.NEXT_PUBLIC_SUPABASE_URL,
        ),
      );
      count++;
    }
  }
  return count;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(`CSP added to ${await hardenDir(resolve("out"))} exported pages`);
