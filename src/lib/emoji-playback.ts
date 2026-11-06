import type { EmojiMessage, ReactionEmoji } from "@/lib/emoji-reactions";
export type ReceivedReaction = Pick<EmojiMessage, "id" | "sender_id" | "emoji">;
// Keep arrivals during the initial history fetch until the unread reaction is known.
// A shared high-water mark prevents the history and live inbox replaying one emoji.
export class ReceivedEmojiPlayback {
  private opening: { peer: string; messages: EmojiMessage[] } | null = null;
  private played = new Map<string, number>();
  begin(peer: string) {
    this.opening = { peer, messages: [] };
  }
  buffer(peer: string, messages: EmojiMessage[]) {
    if (this.opening?.peer !== peer) return false;
    this.opening.messages.push(...messages);
    return true;
  }
  finish(peer: string, unread: ReceivedReaction | null) {
    const arrivals = this.opening?.peer === peer ? this.opening.messages : [];
    const reaction = [unread, ...arrivals].reduce<ReceivedReaction | null>(
      (latest, message) =>
        message?.emoji && (!latest || message.id > latest.id)
          ? message
          : latest,
      null,
    );
    const through = arrivals.reduce(
      (maximum, message) => Math.max(maximum, message.id),
      0,
    );
    this.cancel(peer);
    return { reaction, through };
  }
  cancel(peer: string) {
    if (this.opening?.peer === peer) this.opening = null;
  }
  play(
    message: ReceivedReaction | null,
    show: (emoji: ReactionEmoji) => boolean,
  ) {
    if (
      !message?.emoji ||
      message.id <= (this.played.get(message.sender_id) ?? 0)
    )
      return false;
    if (!show(message.emoji)) return false;
    this.played.set(message.sender_id, message.id);
    return true;
  }
}
