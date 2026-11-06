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

const {
  EMOJI_BURST_INTERVAL_MS,
  emojiBurstLayout,
  EMOJI_BURST_DURATION_MS,
  EMOJI_BURST_LIFETIME_MS,
} = module("../src/lib/emoji-burst-layout.ts");
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
test("22 unread emoji produce 22 ordered animations, each completion advances only its own read boundary", () => {
  const player = new ReceivedEmojiPlayback();
  const unread = Array.from({ length: 22 }, (_, i) => ({
    id: i + 1,
    sender_id: "anna",
    emoji: i % 2 ? "❤️" : "💩",
  }));
  player.begin("anna");
  player.observe("anna", 24);
  player.buffer("anna", [
    { id: 23, sender_id: "anna", emoji: "🔥" },
    { id: 24, sender_id: "anna", emoji: null },
  ]);
  assert.equal(
    player.next("anna"),
    null,
    "wait for history before starting live arrivals",
  );
  assert.equal(player.readableThrough("anna"), 0);
  player.finish("anna", unread);
  const played = [];
  for (let id = 1; id <= 23; id++) {
    const next = player.next("anna");
    assert.equal(next.id, id);
    played.push(next.id);
    assert.equal(
      player.readableThrough("anna"),
      id - 1,
      "queued emoji remain unread",
    );
    player.complete("anna", next.id);
  }
  assert.equal(
    played.length,
    23,
    "all 22 historical emoji and the new arrival have individual effects",
  );
  assert.equal(
    player.readableThrough("anna"),
    24,
    "trailing text is marked after the last effect",
  );
  assert.equal(player.next("anna"), null);
  player.enqueue("anna", unread);
  assert.equal(
    player.next("anna"),
    null,
    "history/live overlap cannot duplicate completed effects",
  );
});
test("leaving a conversation preserves its pending animations; new arrivals append without replacing current emoji", () => {
  const player = new ReceivedEmojiPlayback();
  player.begin("anna");
  player.observe("anna", 3);
  player.finish("anna", [
    { id: 1, sender_id: "anna", emoji: "💩" },
    { id: 2, sender_id: "anna", emoji: "❤️" },
  ]);
  player.complete("anna", 1);
  player.begin("bob");
  player.observe("bob", 4);
  player.finish("bob", [{ id: 4, sender_id: "bob", emoji: "⚡" }]);
  assert.equal(player.next("anna").id, 2);
  assert.equal(player.readableThrough("anna"), 1);
  player.enqueue("anna", [
    { id: 3, sender_id: "anna", emoji: "🔥" },
    { id: 2, sender_id: "anna", emoji: "❤️" },
  ]);
  assert.equal(player.next("anna").id, 2);
  player.begin("anna");
  player.finish("anna", [
    { id: 2, sender_id: "anna", emoji: "❤️" },
    { id: 3, sender_id: "anna", emoji: "🔥" },
  ]);
  player.complete("anna", 2);
  assert.equal(player.next("anna").id, 3);
  assert.equal(player.next("bob").id, 4);
  player.skip("anna");
  assert.equal(player.next("anna"), null);
  assert.equal(player.readableThrough("anna"), 3);
});

test("43 emoji launch every 300 ms while earlier effects stay alive and each message keeps its own completion", () => {
  const player = new ReceivedEmojiPlayback();
  const unread = Array.from({ length: 43 }, (_, i) => ({
    id: i + 1,
    sender_id: "anna",
    emoji: i % 2 ? "❤️" : "💩",
  }));
  player.begin("anna");
  player.observe("anna", 43);
  player.finish("anna", unread);
  assert.equal(EMOJI_BURST_INTERVAL_MS, 300);
  const running = [];
  let peak = 0;
  for (let i = 0; i < 43; i++) {
    const now = i * EMOJI_BURST_INTERVAL_MS;
    for (const effect of running.filter((item) => item.ends <= now))
      player.complete("anna", effect.id);
    for (let j = running.length - 1; j >= 0; j--)
      if (running[j].ends <= now) running.splice(j, 1);
    const message = player.next("anna");
    assert.equal(message.id, i + 1);
    assert.equal(player.start("anna", message.id), true);
    assert.equal(
      player.start("anna", message.id),
      false,
      "live/history refresh cannot start an in-flight effect twice",
    );
    running.push({ id: message.id, ends: now + EMOJI_BURST_LIFETIME_MS });
    peak = Math.max(peak, running.length);
  }
  assert.ok(peak > 1 && peak <= 14);
  assert.equal(
    player.next("anna"),
    null,
    "all 43 effects are launched without waiting for previous completions",
  );
  assert.ok(42 * EMOJI_BURST_INTERVAL_MS + EMOJI_BURST_LIFETIME_MS < 17000);
  assert.ok(
    player.readableThrough("anna") < 43,
    "running effects remain unread until completion",
  );
  for (const effect of running) player.complete("anna", effect.id);
  assert.equal(player.readableThrough("anna"), 43);
});
test("pausing overlapping effects releases their IDs for replay and cannot skip an earlier unfinished reaction", () => {
  const player = new ReceivedEmojiPlayback();
  player.begin("anna");
  player.observe("anna", 3);
  player.finish("anna", [
    { id: 1, sender_id: "anna", emoji: "💩" },
    { id: 2, sender_id: "anna", emoji: "❤️" },
    { id: 3, sender_id: "anna", emoji: "🔥" },
  ]);
  player.start("anna", 1);
  player.start("anna", 2);
  player.complete("anna", 2);
  assert.equal(player.readableThrough("anna"), 0);
  player.release(1);
  assert.equal(player.next("anna").id, 1);
  player.start("anna", 1);
  player.complete("anna", 1);
  assert.equal(player.next("anna").id, 3);
  assert.equal(player.readableThrough("anna"), 2);
});
