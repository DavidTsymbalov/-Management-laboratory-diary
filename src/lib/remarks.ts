"use client";
import { getSupabase } from "@/lib/supabase";
export type StudentRemark = {
  id: string;
  student_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
  dismissed_at: string | null;
};
export async function loadRemarks(
  studentId: string,
  pendingOnly = false,
): Promise<StudentRemark[]> {
  let query = getSupabase()
    .from("student_remarks")
    .select("id,student_id,author_id,author_name,body,created_at,dismissed_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (pendingOnly) query = query.is("dismissed_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
export async function sendRemark(id: string, studentId: string, body: string) {
  const { error } = await getSupabase().rpc("send_student_remark", {
    request_id: id,
    target_student: studentId,
    remark_body: body,
  });
  if (error) throw error;
}
export async function dismissRemark(id: string) {
  const { error } = await getSupabase().rpc("dismiss_student_remark", {
    remark_id: id,
  });
  if (error) throw error;
}
