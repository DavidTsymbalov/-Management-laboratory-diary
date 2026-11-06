"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { viewStudentPassword } from "@/lib/cloud-store";
import { cloudError } from "@/lib/supabase";
export function StudentAccess({
  id,
  name,
  teacher,
  onError,
  onPassword,
  onDelete,
}: {
  id: string;
  name: string;
  teacher: boolean;
  onError: (message: string) => void;
  onPassword: (password: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [next, setNext] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    const timer = window.setTimeout(() => setRevealed(null), 30000);
    return () => window.clearTimeout(timer);
  }, [revealed]);
  async function showPassword() {
    if (revealed) {
      setRevealed(null);
      return;
    }
    setLoading(true);
    try {
      setRevealed(await viewStudentPassword(id));
    } catch (error) {
      onError(cloudError(error));
    } finally {
      setLoading(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await onPassword(next)) {
      setNext("");
      setRevealed(null);
    }
  }
  return (
    <details
      className="teacher-access"
      onToggle={(event) => {
        if (!event.currentTarget.open) setRevealed(null);
      }}
    >
      <summary>
        <KeyRound size={16} aria-hidden="true" />
        Доступ
      </summary>
      <div className="teacher-access-body">
        {teacher && (
          <>
            <div className="teacher-password-view">
              <button
                type="button"
                className="teacher-button subtle"
                disabled={loading}
                onClick={() => void showPassword()}
              >
                {revealed ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
                {loading
                  ? "Открываем…"
                  : revealed
                    ? "Скрыть пароль"
                    : "Посмотреть пароль"}
              </button>
              {revealed && (
                <output
                  className="teacher-password-output"
                  aria-label={`Пароль: ${name}`}
                >
                  {revealed}
                </output>
              )}
            </div>
            <form
              noValidate
              onSubmit={(event) => void save(event)}
              className="teacher-password-form"
            >
              <label htmlFor={`password-${id}`}>Новый пароль</label>
              <PasswordInput
                id={`password-${id}`}
                name="new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                minLength={8}
                maxLength={128}
                placeholder="От 8 символов"
                autoComplete="new-password"
              />
              <button className="teacher-button" type="submit">
                Сохранить пароль
              </button>
            </form>
          </>
        )}
        <button
          type="button"
          className="teacher-button subtle"
          onClick={onDelete}
        >
          <Trash2 size={16} aria-hidden="true" />
          Удалить ученика
        </button>
      </div>
    </details>
  );
}
