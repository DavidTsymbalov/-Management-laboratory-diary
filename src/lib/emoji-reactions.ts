export const EMOJI_REACTIONS = [
  { emoji: "💩", name: "Какашка", sound: "poop" },
  { emoji: "❤️", name: "Сердце", sound: "heart" },
  { emoji: "😂", name: "Смех", sound: "laugh" },
  { emoji: "🔥", name: "Огонь", sound: "fire" },
  { emoji: "👏", name: "Аплодисменты", sound: "clap" },
  { emoji: "👻", name: "Привидение", sound: "ghost" },
  { emoji: "🎉", name: "Праздник", sound: "party" },
  { emoji: "⚡", name: "Молния", sound: "zap" },
] as const;
export type ReactionEmoji = (typeof EMOJI_REACTIONS)[number]["emoji"];
export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return EMOJI_REACTIONS.some((item) => item.emoji === value);
}
export function reactionName(emoji: string) {
  return EMOJI_REACTIONS.find((item) => item.emoji === emoji)?.name ?? "Эмодзи";
}
export type EmojiMessage = {
  id: number;
  sender_id: string;
  recipient_id: string;
  emoji: ReactionEmoji | null;
  body: string | null;
  client_nonce: string;
  sent_at: string;
};
export type EmojiPeer = {
  id: string;
  name: string;
  last_emoji: ReactionEmoji | null;
  last_body?: string | null;
  last_message_id: number | null;
  last_sent_at: string | null;
  unread: number;
  blocked: boolean;
};
export type EmojiChatState = {
  peers: EmojiPeer[];
  incoming: EmojiMessage[];
  cursor: number;
};
export function mergeEmojiMessages(
  current: EmojiMessage[],
  incoming: EmojiMessage[],
) {
  const messages = new Map<number, EmojiMessage>();
  for (const item of [...current, ...incoming]) messages.set(item.id, item);
  return [...messages.values()].sort((a, b) => a.id - b.id);
}
