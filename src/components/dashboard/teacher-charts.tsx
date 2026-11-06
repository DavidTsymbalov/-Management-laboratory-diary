import type { Student } from "@/data/seed";
import { computeStats } from "@/lib/stats";
const shortDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Moscow",
});
export function TeacherCharts({ students }: { students: Student[] }) {
  const stats = computeStats(students);
  const maxWeek = Math.max(1, ...stats.weeklyAwards.map((d) => d.count));
  return (
    <div className="teacher-chart-grid">
      <section
        className="teacher-section"
        aria-labelledby="weekly-awards-heading"
      >
        <div className="teacher-section-heading">
          <h2 id="weekly-awards-heading">Награды за 7 дней</h2>
          <span>{stats.awardsThisWeek} всего</span>
        </div>
        <ol className="teacher-week-chart">
          {stats.weeklyAwards.map((day) => (
            <li key={day.day}>
              <strong>{day.count}</strong>
              <div className="teacher-week-track" aria-hidden="true">
                <span style={{ height: `${(day.count / maxWeek) * 100}%` }} />
              </div>
              <time dateTime={day.day}>
                {shortDate.format(new Date(`${day.day}T12:00:00Z`))}
              </time>
            </li>
          ))}
        </ol>
      </section>
      <section
        className="teacher-section"
        aria-labelledby="distribution-heading"
      >
        <div className="teacher-section-heading">
          <h2 id="distribution-heading">Распределение баллов</h2>
          <span>Учеников в диапазоне</span>
        </div>
        <dl className="teacher-distribution">
          {stats.distribution.map((band) => (
            <div key={band.label}>
              <dt>{band.label}</dt>
              <dd>
                <span className="teacher-distribution-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${students.length ? (band.count / students.length) * 100 : 0}%`,
                    }}
                  />
                </span>
                <strong>{band.count}</strong>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
