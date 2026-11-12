export const MAX_LESSON_PRESENTATIONS = 10;
export const MAX_PRESENTATION_BYTES = 25 * 1024 * 1024;
export const LESSON_PRESENTATIONS_BUCKET = "lesson-presentations";
export type LessonPresentation = {
  id: string;
  title: string;
  kind: "file" | "link";
  url: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
};
export type ClassroomLesson = {
  id: string;
  lesson_date: string;
  title: string;
  body: string;
  homework: string;
  homework_due: string | null;
  published: boolean;
  revision: number;
  cancelled: boolean;
  cancellation_reason: string | null;
  presentations: LessonPresentation[];
};
export type PresentationDraft = LessonPresentation & { file?: File };
export type LessonDraft = {
  lesson_date: string;
  title: string;
  body: string;
  homework: string;
  homework_due: string;
  published: boolean;
  revision: number;
  presentations: PresentationDraft[];
};
export function presentationLink(value: string): string | null {
  try {
    if (value.length > 2048) return null;
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
export function presentationFileType(name: string) {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.pptx$/i.test(name))
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return null;
}
export function presentationFileError(file: Pick<File, "name" | "size">) {
  if (!presentationFileType(file.name))
    return "Выберите презентацию в PDF или PPTX.";
  if (!file.size || file.size > MAX_PRESENTATION_BYTES)
    return "Размер файла — от 1 байта до 25 МБ.";
  if (file.name.length > 180)
    return "Сократите название файла до 180 символов.";
  return null;
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function lessonDraftError(draft: LessonDraft): string | null {
  if (!validDate(draft.lesson_date)) return "Выберите дату занятия.";
  if (!draft.title.trim() || draft.title.trim().length > 120)
    return "Укажите тему занятия до 120 символов.";
  if (draft.body.length > 6000 || draft.homework.length > 6000)
    return "Текст занятия и ДЗ — до 6000 символов каждый.";
  if (draft.homework_due && !validDate(draft.homework_due))
    return "Выберите срок ДЗ.";
  if (draft.homework_due && draft.homework_due < draft.lesson_date)
    return "Срок ДЗ не может быть раньше занятия.";
  if (draft.presentations.length > MAX_LESSON_PRESENTATIONS)
    return "К занятию можно прикрепить до 10 презентаций.";
  for (const item of draft.presentations) {
    if (!item.title.trim() || item.title.trim().length > 180)
      return "Укажите название каждой презентации до 180 символов.";
    if (item.kind === "link" && !presentationLink(item.url ?? ""))
      return "Вставьте полную ссылку, начинающуюся с https://.";
    if (item.file) {
      const error = presentationFileError(item.file);
      if (error) return error;
    }
  }
  return null;
}
