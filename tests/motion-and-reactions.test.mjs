import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function module(path) {
  const context = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return context.exports;
}
const { squarePixelGrid, pixelOrder } = module("../src/lib/pixel-grid.ts");
const { EMOJI_REACTIONS, isReactionEmoji, mergeEmojiMessages } = module(
  "../src/lib/emoji-reactions.ts",
);
test("theme grid covers portrait, landscape and desktop with exact square cells and one rank per tile", () => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1440, 900],
    [2560, 1440],
  ]) {
    const grid = squarePixelGrid(width, height);
    assert.equal(grid.cell * grid.columns, width);
    assert.ok(grid.rows * grid.cell >= height);
    assert.ok((grid.rows - 1) * grid.cell < height);
    const ranks = pixelOrder(grid.rows * grid.columns);
    assert.equal(new Set(ranks).size, ranks.length);
    assert.equal(Math.min(...ranks), 0);
    assert.equal(Math.max(...ranks), ranks.length - 1);
  }
});
test("emoji allowlist, message reconciliation and sound files agree and contain bounded non-clipping PCM", () => {
  assert.equal(EMOJI_REACTIONS.length, 8);
  assert.equal(isReactionEmoji("💩"), true);
  assert.equal(isReactionEmoji("<img>"), false);
  const previous = [
    { id: 2, emoji: "💩" },
    { id: 1, emoji: "❤️" },
  ];
  const merged = mergeEmojiMessages(previous, [
    { id: 2, emoji: "💩" },
    { id: 3, emoji: "🔥" },
  ]);
  assert.deepEqual(
    Array.from(merged, (message) => message.id),
    [1, 2, 3],
  );
  assert.deepEqual(
    previous.map((message) => message.id),
    [2, 1],
  );
  for (const reaction of EMOJI_REACTIONS) {
    const bytes = readFileSync(
      new URL(`../public/sounds/emoji-${reaction.sound}.wav`, import.meta.url),
    );
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
    assert.equal(bytes.readUInt16LE(22), 1);
    assert.equal(bytes.readUInt16LE(34), 16);
    const duration = bytes.readUInt32LE(40) / (bytes.readUInt32LE(24) * 2);
    assert.ok(duration >= 0.15 && duration <= 0.45);
    let peak = 0;
    for (let offset = 44; offset < bytes.length; offset += 2)
      peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)));
    assert.ok(peak > 1000 && peak < 16384);
    assert.equal(bytes.readInt16LE(44), 0);
    assert.equal(bytes.readInt16LE(bytes.length - 2), 0);
  }
});
