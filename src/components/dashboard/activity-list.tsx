import type { ActivityEntry } from "@/lib/cloud-store";
const formatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});
const verbs = {
  lesson_create: "Добавлено занятие",
  lesson_cancel: "Занятие отменено",
  lesson_restore: "Занятие восстановлено",
  attendance_mark: "Посещаемость изменена",
  homework_create: "Опубликовано ДЗ",
  homework_edit: "Изменено ДЗ",
  homework_archive: "ДЗ в архиве",
  homework_restore: "ДЗ возвращено",
  create: "Добавлен ученик",
  delete: "Удалён ученик",
  points: "Баллы",
  achievement: "Награда",
  admin_grant: "Назначен администратор",
  admin_revoke: "Сняты права администратора",
  admin_limits: "Изменены ограничения",
};
export function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  if (!entries.length)
    return (
      <p className="teacher-empty">
        Действий пока нет. Новые операции появятся здесь.
      </p>
    );
  return (
    <ol className="teacher-activity">
      {entries.map((entry) => (
        <li key={entry.id}>
          <div>
            <strong>
              {verbs[entry.kind]}
              {entry.kind === "points"
                ? ` ${Number(entry.amount) > 0 ? "+" : ""}${entry.amount?.toLocaleString("ru-RU")}`
                : ""}
            </strong>
            <p>
              {entry.student_name}
              {entry.title ? ` — ${entry.title}` : ""}
            </p>
            <small>{entry.actor_name}</small>
          </div>
          <time dateTime={entry.created_at}>
            {formatter.format(new Date(entry.created_at))}
          </time>
        </li>
      ))}
    </ol>
  );
}
