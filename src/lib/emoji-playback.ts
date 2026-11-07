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
  private started = new Set<number>();
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
      [...(this.queues.get(peer)?.values() ?? [])]
        .filter((message) => !this.started.has(message.id))
        .sort((a, b) => a.id - b.id)[0] ?? null
    );
  }
  start(peer: string, id: number) {
    if (!this.queues.get(peer)?.has(id) || this.started.has(id)) return false;
    this.started.add(id);
    return true;
  }
  release(id: number) {
    this.started.delete(id);
  }
  complete(peer: string, id: number) {
    this.started.delete(id);
    this.queues.get(peer)?.delete(id);
    this.completed.add(id);
  }
  skip(peer: string) {
    for (const message of this.queues.get(peer)?.values() ?? []) {
      this.started.delete(message.id);
      this.completed.add(message.id);
    }
    this.queues.delete(peer);
  }
  discard(ids: number[]) {
    const removed = new Set(ids);
    if (this.opening)
      this.opening.messages = this.opening.messages.filter(
        (message) => !removed.has(message.id),
      );
    for (const queue of this.queues.values())
      for (const id of removed) queue.delete(id);
    for (const id of removed) {
      this.started.delete(id);
      this.completed.add(id);
    }
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
