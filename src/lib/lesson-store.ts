"use client";
import { getSupabase } from "@/lib/supabase";
import {
  LESSON_PRESENTATIONS_BUCKET,
  lessonDraftError,
  presentationFileType,
  presentationLink,
  type ClassroomLesson,
  type LessonDraft,
  type LessonPresentation,
} from "@/lib/lesson-materials";
export async function loadLessons(month: string): Promise<ClassroomLesson[]> {
  const { data, error } = await getSupabase().rpc("list_classroom_lessons", {
    month_date: `${month}-01`,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Не удалось прочитать занятия.");
  return data;
}
export async function saveLesson(
  draft: LessonDraft,
  previous: LessonPresentation[],
  onProgress: (done: number, total: number) => void,
): Promise<string> {
  const validation = lessonDraftError(draft);
  if (validation) throw new Error(validation);
  const client = getSupabase();
  const bucket = client.storage.from(LESSON_PRESENTATIONS_BUCKET);
  const uploaded: string[] = [];
  const attachments = draft.presentations.map((item) => ({
    id: item.id,
    title: item.title.trim(),
    kind: item.kind,
    url: item.url,
    storage_path: item.storage_path,
    file_name: item.file_name,
    mime_type: item.mime_type,
    size_bytes: item.size_bytes,
  }));
  try {
    const pending = draft.presentations
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.file);
    if (pending.length) {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user)
        throw new Error("Войдите в аккаунт преподавателя снова.");
      let done = 0;
      // Two uploads at a time keep the form usable on a mobile connection.
      for (let start = 0; start < pending.length; start += 2) {
        const results = await Promise.allSettled(
          pending.slice(start, start + 2).map(async ({ item, index }) => {
            const file = item.file!;
            const contentType = presentationFileType(file.name)!;
            const path = `${data.user.id}/${crypto.randomUUID()}.${contentType === "application/pdf" ? "pdf" : "pptx"}`;
            uploaded.push(path);
            const { error: uploadError } = await bucket.upload(path, file, {
              contentType,
              upsert: false,
            });
            if (uploadError) throw uploadError;
            attachments[index] = {
              ...attachments[index],
              url: null,
              storage_path: path,
              file_name: file.name,
              mime_type: contentType,
              size_bytes: file.size,
            };
            onProgress(++done, pending.length);
          }),
        );
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      }
    }
    const { data, error } = await client.rpc("save_lesson_materials", {
      target_date: draft.lesson_date,
      lesson_title: draft.title.trim(),
      lesson_body: draft.body.trim(),
      lesson_homework: draft.homework.trim(),
      homework_due: draft.homework_due || null,
      make_published: draft.published,
      expected_revision: draft.revision,
      presentations: attachments.map((item) =>
        item.kind === "link"
          ? { ...item, url: presentationLink(item.url ?? "") }
          : item,
      ),
    });
    if (error) throw error;
    if (typeof data !== "string")
      throw new Error("Сохранение не подтверждено. Обновите список занятий.");
    const retained = new Set(attachments.map((item) => item.storage_path));
    const removed = previous.flatMap((item) =>
      item.storage_path && !retained.has(item.storage_path)
        ? [item.storage_path]
        : [],
    );
    // Deletion policy never permits removing a file that is still attached.
    if (removed.length) await bucket.remove(removed).catch(() => {});
    return data;
  } catch (error) {
    // Also safe after an ambiguous network response: committed references block deletion.
    if (uploaded.length) await bucket.remove(uploaded).catch(() => {});
    throw error;
  }
}
export async function lessonPresentationUrl(
  item: LessonPresentation,
): Promise<string> {
  if (item.kind === "link") {
    const url = presentationLink(item.url ?? "");
    if (!url) throw new Error("Ссылка на презентацию некорректна.");
    return url;
  }
  if (!item.storage_path) throw new Error("Файл презентации не найден.");
  const { data, error } = await getSupabase()
    .storage.from(LESSON_PRESENTATIONS_BUCKET)
    .createSignedUrl(
      item.storage_path,
      300,
      item.mime_type === "application/pdf"
        ? undefined
        : { download: item.file_name || true },
    );
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Не удалось открыть презентацию.");
  return data.signedUrl;
}
