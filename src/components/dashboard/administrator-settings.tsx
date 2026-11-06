"use client";
import { useState, type FormEvent } from "react";
import { StudentPicker } from "@/components/ui/student-picker";
import type { Student } from "@/data/seed";
import {
  DEFAULT_ADMINISTRATOR_LIMITS,
  type AdministratorLimits,
} from "@/lib/cloud-store";
const fields = [
  {
    key: "capacity",
    label: "Участников в классе",
    hint: "После удаления место освобождается.",
  },
  { key: "deleted", label: "Удалений в день" },
  {
    key: "points",
    label: "Баллов в день",
    hint: "Сумма начислений и списаний всем ученикам.",
  },
  { key: "awards", label: "Наград в день" },
] as const;
export function AdministratorSettings({
  students,
  initialId,
  initialLimits,
  onSave,
  onCancel,
  onEdit,
}: {
  students: Student[];
  initialId?: string;
  initialLimits?: AdministratorLimits;
  onSave: (id: string, limits: AdministratorLimits) => Promise<boolean>;
  onCancel: () => void;
  onEdit?: () => void;
}) {
  const [id, setId] = useState(initialId ?? "");
  const [limits, setLimits] = useState<
    Record<keyof AdministratorLimits, string>
  >(
    () =>
      Object.fromEntries(
        Object.entries(initialLimits ?? DEFAULT_ADMINISTRATOR_LIMITS).map(
          ([key, value]) => [key, String(value)],
        ),
      ) as Record<keyof AdministratorLimits, string>,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(
      id,
      Object.fromEntries(
        Object.entries(limits).map(([key, value]) => [
          key,
          value.trim() === "" ? NaN : Number(value),
        ]),
      ) as AdministratorLimits,
    );
  }
  return (
    <form
      noValidate
      className="teacher-admin-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="teacher-section-heading">
        <h2>
          {initialId ? "Права администратора" : "Назначить администратора"}
        </h2>
        <button
          type="button"
          className="teacher-button subtle"
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>
      <div className="teacher-field">
        <label htmlFor="administrator-student">Ученик</label>
        <StudentPicker
          id="administrator-student"
          value={id}
          students={students}
          onChange={(next) => {
            setId(next);
            onEdit?.();
          }}
          disabled={Boolean(initialId)}
        />
      </div>
      <div className="teacher-limit-fields">
        {fields.map((field) => (
          <div key={field.key} className="teacher-field">
            <label htmlFor={`limit-${field.key}`}>{field.label}</label>
            <input
              id={`limit-${field.key}`}
              name={field.key}
              type="number"
              min={0}
              max={1000000}
              step={1}
              inputMode="numeric"
              value={limits[field.key]}
              onChange={(event) =>
                setLimits((previous) => ({
                  ...previous,
                  [field.key]: event.target.value,
                }))
              }
            />
            {"hint" in field && <p className="teacher-hint">{field.hint}</p>}
          </div>
        ))}
      </div>
      <p className="teacher-hint">
        Дневные лимиты сбрасываются в 00:00 по Москве. Ноль запрещает действие.
        Логин и пароль ученика сохраняются.
      </p>
      <button type="submit" className="teacher-button primary">
        Сохранить права
      </button>
    </form>
  );
}
