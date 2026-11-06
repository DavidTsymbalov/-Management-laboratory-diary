"use client";
import { Check, CircleAlert, X } from "lucide-react";
export type Feedback = { type: "error" | "success"; message: string } | null;
export function FeedbackToast({
  feedback,
  onDismiss,
}: {
  feedback: Feedback;
  onDismiss: () => void;
}) {
  if (!feedback) return null;
  const Icon = feedback.type === "error" ? CircleAlert : Check;
  return (
    <div
      className="feedback-toast"
      data-kind={feedback.type}
      role={feedback.type === "error" ? "alert" : "status"}
    >
      <Icon size={18} aria-hidden="true" />
      <p>{feedback.message}</p>
      <button
        type="button"
        aria-label="Закрыть уведомление"
        onClick={onDismiss}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
