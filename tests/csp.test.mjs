import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hardenHtml } from "../scripts/harden-static-export.mjs";
test("static CSP hashes every exact inline script and restricts script attributes and remote connections", () => {
  const scripts = [
    "self.__next_f.push([1,'bootstrap'])",
    "\nlocalStorage.getItem('ml-theme');\n",
  ];
  const html = `<html><head><script>${scripts[0]}</script><script src="/app.js"></script></head><body><script>${scripts[1]}</script></body></html>`;
  const result = hardenHtml(html);
  assert.ok(
    result.indexOf("Content-Security-Policy") < result.indexOf("<script"),
  );
  const policy = result.match(/content="([^"]+)"/)[1];
  for (const script of scripts)
    assert.ok(
      policy.includes(
        `'sha256-${createHash("sha256").update(script).digest("base64")}'`,
      ),
    );
  assert.ok(
    !policy
      .split(";")
      .find((value) => value.trim().startsWith("script-src "))
      .includes("unsafe-"),
  );
  assert.match(policy, /script-src-attr 'none'/);
  assert.match(
    policy,
    /connect-src 'self' https:\/\/pnpanexhudlalavcevck.supabase.co wss:\/\/pnpanexhudlalavcevck.supabase.co/,
  );
  assert.equal(hardenHtml(result), result, "idempotent postbuild");
  assert.throws(() => hardenHtml(html, "http://example.test"), /HTTPS/);
});
