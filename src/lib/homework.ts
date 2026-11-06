"use client";
import { getSupabase } from "@/lib/supabase";
export type Homework = {
  id: string;
  title: string;
  body: string;
  due_date: string | null;
  archived: boolean;
  revision: number;
  author_name: string;
  created_at: string;
  updated_at: string;
};
export async function loadHomework(archived = false): Promise<Homework[]> {
  const { data, error } = await getSupabase()
    .from("classroom_homework")
    .select(
      "id,title,body,due_date,archived,revision,author_name,created_at,updated_at",
    )
    .eq("archived", archived)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}
export async function saveHomework(input: {
  id: string;
  title: string;
  body: string;
  due_date: string | null;
  revision: number;
}): Promise<Homework> {
  const { data, error } = await getSupabase().rpc("save_classroom_homework", {
    homework_id: input.id,
    homework_title: input.title,
    homework_body: input.body,
    homework_due: input.due_date,
    expected_revision: input.revision,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id)
    throw new Error("Сохранение не подтверждено. Повторите попытку.");
  return row;
}
export async function archiveHomework(item: Homework): Promise<void> {
  const { error } = await getSupabase().rpc("archive_classroom_homework", {
    homework_id: item.id,
    make_archived: !item.archived,
    expected_revision: item.revision,
  });
  if (error) throw error;
}
