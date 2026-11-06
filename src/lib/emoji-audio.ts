"use client";
import { EMOJI_REACTIONS, type ReactionEmoji } from "@/lib/emoji-reactions";
import { publicUrl } from "@/lib/public-url";
let context: AudioContext | undefined;
let generation = 0;
let active: AudioBufferSourceNode | undefined;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();
/** Called synchronously from a tap: mobile browsers require a user gesture. */
export function unlockEmojiAudio() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended")
      void context.resume().catch(() => undefined);
  } catch {
    /* Emoji delivery works even when audio is unavailable. */
  }
}
export function stopEmojiAudio() {
  generation++;
  if (active) {
    try {
      active.stop();
    } catch {
      /* already ended */
    }
    active = undefined;
  }
}
export async function playEmojiAudio(emoji: ReactionEmoji) {
  const audio = context;
  if (!audio || audio.state !== "running" || document.hidden) return;
  const reaction = EMOJI_REACTIONS.find((item) => item.emoji === emoji);
  if (!reaction) return;
  const token = ++generation;
  try {
    let buffer = buffers.get(reaction.sound);
    if (!buffer) {
      let pending = loading.get(reaction.sound);
      if (!pending) {
        pending = fetch(publicUrl(`/sounds/emoji-${reaction.sound}.wav`))
          .then((response) => {
            if (!response.ok) throw new Error("Sound unavailable");
            return response.arrayBuffer();
          })
          .then((data) => audio.decodeAudioData(data));
        loading.set(reaction.sound, pending);
      }
      try {
        buffer = await pending;
        buffers.set(reaction.sound, buffer);
      } finally {
        loading.delete(reaction.sound);
      }
    }
    if (token !== generation || document.hidden || audio.state !== "running")
      return;
    if (active) {
      try {
        active.stop();
      } catch {
        /* already ended */
      }
    }
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    gain.gain.value = 0.38;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(audio.destination);
    active = source;
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (active === source) active = undefined;
    };
  } catch {
    /* A missing/muted sound never fails message delivery. */
  }
}
