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
test("emoji allowlist and message reconciliation preserve order without mutating history", () => {
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
});

const { emojiBurstLayout, EMOJI_BURST_DURATION_MS, EMOJI_BURST_LIFETIME_MS } =
  module("../src/lib/emoji-burst-layout.ts");
const { ReceivedEmojiPlayback } = module("../src/lib/emoji-playback.ts");
test("large, slow emoji reach all screen regions on phone, landscape and desktop", () => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1440, 900],
    [2560, 1440],
  ]) {
    const origin = { x: width * 0.85, y: height * 0.9 };
    const particles = emojiBurstLayout(width, height, origin);
    assert.equal(particles.length, 48);
    const targets = particles.map((p) => ({
      x: origin.x + p.x,
      y: origin.y + p.y,
    }));
    assert.ok(Math.min(...targets.map((p) => p.x)) < width * 0.3);
    assert.ok(Math.max(...targets.map((p) => p.x)) > width * 0.7);
    assert.ok(Math.min(...targets.map((p) => p.y)) < height * 0.3);
    assert.ok(Math.max(...targets.map((p) => p.y)) > height * 0.7);
    for (const [index, p] of particles.entries()) {
      assert.ok(p.size >= 48 && p.size <= 96);
      assert.ok(
        targets[index].x >= p.size / 2 &&
          targets[index].x <= width - p.size / 2,
      );
      assert.ok(
        targets[index].y >= p.size / 2 &&
          targets[index].y <= height - p.size / 2,
      );
      assert.ok(EMOJI_BURST_DURATION_MS + p.delay < EMOJI_BURST_LIFETIME_MS);
    }
  }
  assert.ok(EMOJI_BURST_DURATION_MS >= 3500);
});
test("opening a conversation replays an unread reaction and absorbs arrivals during history fetch once", () => {
  const player = new ReceivedEmojiPlayback();
  const shown = [];
  const show = (emoji) => {
    shown.push(emoji);
    return true;
  };
  player.begin("anna");
  assert.equal(
    player.buffer("anna", [
      { id: 20, sender_id: "anna", emoji: "💩" },
      { id: 21, sender_id: "anna", emoji: null, body: "Текст после эмодзи" },
    ]),
    true,
  );
  assert.equal(
    player.buffer("bob", [{ id: 22, sender_id: "bob", emoji: "🔥" }]),
    false,
  );
  const completed = player.finish("anna", {
    id: 10,
    sender_id: "anna",
    emoji: "❤️",
  });
  assert.equal(completed.reaction.id, 20);
  assert.equal(completed.through, 21);
  assert.equal(player.play(completed.reaction, show), true);
  assert.equal(player.play(completed.reaction, show), false);
  assert.equal(
    player.play({ id: 10, sender_id: "anna", emoji: "❤️" }, show),
    false,
  );
  assert.equal(
    player.play({ id: 22, sender_id: "bob", emoji: "🔥" }, show),
    true,
  );
  assert.deepEqual(shown, ["💩", "🔥"]);
  assert.equal(player.buffer("anna", []), false);
});
test("history replay skips read/text messages, cancellation and disabled effects consume no reaction", () => {
  const player = new ReceivedEmojiPlayback();
  player.begin("anna");
  player.buffer("anna", [{ id: 2, sender_id: "anna", emoji: "💩" }]);
  player.cancel("anna");
  assert.equal(player.finish("anna", null).reaction, null);
  player.begin("anna");
  player.buffer("anna", [{ id: 3, sender_id: "anna", emoji: null }]);
  assert.equal(player.finish("anna", null).reaction, null);
  const unread = { id: 4, sender_id: "anna", emoji: "❤️" };
  assert.equal(
    player.play(unread, () => false),
    false,
  );
  assert.equal(
    player.play(unread, () => true),
    true,
  );
  player.begin("anna");
  assert.equal(player.finish("anna", null).reaction, null);
});
