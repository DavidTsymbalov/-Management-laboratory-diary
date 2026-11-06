import type { EmojiMessage } from "@/lib/emoji-reactions";
export type ReceivedReaction = Pick<
  EmojiMessage,
  "id" | "sender_id" | "emoji"
> & { point?: { x: number; y: number } };
// One ordered queue per conversation. Pending reactions survive navigation within
// the cabinet; only completed animations advance the server read boundary.
export class ReceivedEmojiPlayback {
  private opening: { peer: string; messages: EmojiMessage[] } | null = null;
  private queues = new Map<string, Map<number, ReceivedReaction>>();
  private completed = new Set<number>();
  private observed = new Map<string, number>();
  begin(peer: string) {
    this.opening = { peer, messages: [] };
  }
  isOpening(peer: string) {
    return this.opening?.peer === peer;
  }
  buffer(peer: string, messages: EmojiMessage[]) {
    if (!this.isOpening(peer)) return false;
    this.opening!.messages.push(...messages);
    return true;
  }
  observe(peer: string, through: number) {
    this.observed.set(peer, Math.max(this.observed.get(peer) ?? 0, through));
  }
  enqueue(peer: string, messages: ReceivedReaction[]) {
    const queue = this.queues.get(peer) ?? new Map<number, ReceivedReaction>();
    for (const message of messages)
      if (
        message.emoji &&
        !this.completed.has(message.id) &&
        !queue.has(message.id)
      )
        queue.set(message.id, message);
    this.queues.set(peer, queue);
  }
  finish(peer: string, unread: ReceivedReaction[]) {
    const arrivals = this.isOpening(peer) ? this.opening!.messages : [];
    this.enqueue(peer, [...unread, ...arrivals]);
    this.observe(
      peer,
      arrivals.reduce((max, message) => Math.max(max, message.id), 0),
    );
    this.cancel(peer);
  }
  cancel(peer: string) {
    if (this.isOpening(peer)) this.opening = null;
  }
  next(peer: string): ReceivedReaction | null {
    if (this.isOpening(peer)) return null;
    return (
      [...(this.queues.get(peer)?.values() ?? [])].sort(
        (a, b) => a.id - b.id,
      )[0] ?? null
    );
  }
  complete(peer: string, id: number) {
    this.queues.get(peer)?.delete(id);
    this.completed.add(id);
  }
  skip(peer: string) {
    for (const message of this.queues.get(peer)?.values() ?? [])
      this.completed.add(message.id);
    this.queues.delete(peer);
  }
  readableThrough(peer: string) {
    if (this.isOpening(peer)) return 0;
    let through = this.observed.get(peer) ?? 0;
    for (const message of this.queues.get(peer)?.values() ?? [])
      if (message.sender_id === peer)
        through = Math.min(through, message.id - 1);
    return through;
  }
}
