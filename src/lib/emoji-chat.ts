"use client";
import { getSupabase } from "@/lib/supabase";
import {
  isReactionEmoji,
  type EmojiChatState,
  type EmojiMessage,
  type ReactionEmoji,
} from "@/lib/emoji-reactions";
export async function loadEmojiState(
  cursor: number | null,
  changeCursor: number | null = null,
): Promise<EmojiChatState> {
  const { data, error } = await getSupabase().rpc("student_chat_state", {
    after_message_id: cursor,
    after_change_id: changeCursor,
  });
  if (error) throw error;
  if (
    !data ||
    !Array.isArray(data.peers) ||
    !Array.isArray(data.incoming) ||
    !Number.isFinite(Number(data.cursor))
  )
    throw new Error("Не удалось прочитать чаты.");
  return {
    ...data,
    cursor: Number(data.cursor),
    changes: (data.changes ?? []).map((item: EmojiMessage) => ({
      ...item,
      id: Number(item.id),
    })),
    change_cursor: Number(data.change_cursor ?? 0),
  };
}
export async function loadEmojiThread(
  peer: string,
  before: number | null = null,
): Promise<EmojiMessage[]> {
  const { data, error } = await getSupabase().rpc("student_emoji_thread", {
    peer_id: peer,
    before_id: before,
  });
  if (error) throw error;
  return (data ?? [])
    .map((item: EmojiMessage) => ({ ...item, id: Number(item.id) }))
    .sort((a: EmojiMessage, b: EmojiMessage) => a.id - b.id);
}
export async function sendEmoji(
  peer: string,
  emoji: ReactionEmoji,
  nonce: string,
): Promise<EmojiMessage> {
  if (!isReactionEmoji(emoji)) throw new Error("Выберите эмодзи из панели.");
  const { data, error } = await getSupabase().rpc("send_student_emoji", {
    peer_id: peer,
    reaction: emoji,
    request_id: nonce,
  });
  if (error) throw error;
  const item = Array.isArray(data) ? data[0] : data;
  if (!item?.id)
    throw new Error("Отправка не подтверждена. Повторите попытку.");
  return { ...item, id: Number(item.id) };
}
export async function sendTextMessage(
  peer: string,
  body: string,
  nonce: string,
): Promise<EmojiMessage> {
  const text = body.trim();
  if (!text || Array.from(text).length > 2000)
    throw new Error("Сообщение должно содержать от 1 до 2000 символов.");
  const { data, error } = await getSupabase().rpc("send_student_message", {
    peer_id: peer,
    message_body: text,
    request_id: nonce,
  });
  if (error) throw error;
  const item = Array.isArray(data) ? data[0] : data;
  if (!item?.id)
    throw new Error("Отправка не подтверждена. Повторите попытку.");
  return { ...item, id: Number(item.id) };
}
export async function loadUnreadReactions(
  peer: string,
  studentId: string,
  through: number,
) {
  const client = getSupabase();
  const { data: position, error: readError } = await client
    .from("student_emoji_reads")
    .select("through_id")
    .eq("owner_id", studentId)
    .eq("peer_id", peer)
    .maybeSingle();
  if (readError) throw readError;
  let after = Number(position?.through_id ?? 0);
  const reactions: Pick<EmojiMessage, "id" | "sender_id" | "emoji">[] = [];
  while (after < through) {
    const { data, error } = await client
      .from("student_emoji_messages")
      .select("id,sender_id,emoji")
      .eq("sender_id", peer)
      .eq("recipient_id", studentId)
      .gt("id", after)
      .lte("id", through)
      .not("emoji", "is", null)
      .order("id", { ascending: true })
      .limit(200);
    if (error) throw error;
    const page = data ?? [];
    for (const message of page)
      if (isReactionEmoji(message.emoji))
        reactions.push({
          ...message,
          id: Number(message.id),
          emoji: message.emoji,
        });
    if (page.length < 200) break;
    const next = Number(page.at(-1)?.id);
    if (!Number.isFinite(next) || next <= after)
      throw new Error(
        "Не удалось загрузить непрочитанные эмодзи. Повторите попытку.",
      );
    after = next;
  }
  return reactions;
}
export async function markEmojiRead(peer: string, through: number) {
  const { error } = await getSupabase().rpc("mark_student_emoji_read", {
    peer_id: peer,
    through_id: through,
  });
  if (error) throw error;
}
export async function blockEmojiPeer(peer: string, blocked: boolean) {
  const { error } = await getSupabase().rpc("block_student_emojis", {
    peer_id: peer,
    blocked,
  });
  if (error) throw error;
}

export async function deleteChatMessage(id: number): Promise<EmojiMessage> {
  const { data, error } = await getSupabase().rpc("delete_student_message", {
    message_id: id,
  });
  if (error) throw error;
  const item = Array.isArray(data) ? data[0] : data;
  if (!item?.deleted_at)
    throw new Error("Удаление не подтверждено. Повторите попытку.");
  return { ...item, id: Number(item.id) };
}
