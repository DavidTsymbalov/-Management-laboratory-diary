import type { Student } from "@/data/seed";
import { rankedStudents } from "@/lib/store";

export function TeacherCharts({ students }: { students: Student[] }) {
  if (!students.length) return null;
  const leaders = rankedStudents(students).slice(0, 5);
  const maxPoints = Math.max(1, ...leaders.map((student) => student.nuts));
  const withAchievements = students.filter((student) => student.achievements.length > 0).length;
  const coverage = Math.round(withAchievements / students.length * 100);

  return <div className="chart-grid">
    <section className="panel chart-panel" aria-labelledby="class-points-chart">
      <div className="chart-heading">
        <h2 id="class-points-chart">Первые пять в рейтинге</h2>
      </div>
      <ol className="chart-bars">
        {leaders.map((student) => <li key={student.id} className="chart-bar-row">
          <div className="chart-bar-label"><span>{student.name}</span><strong>{student.nuts.toLocaleString("ru-RU")}<span className="sr-only"> баллов</span></strong></div>
          <div className="chart-track" aria-hidden="true"><div className="chart-bar-fill" style={{ width: `${Math.max(0, student.nuts) / maxPoints * 100}%` }} /></div>
        </li>)}
      </ol>
    </section>
    <section className="panel chart-panel" aria-labelledby="class-coverage-chart">
      <div className="chart-heading">
        <h2 id="class-coverage-chart">Достижения</h2>
      </div>
      <div className="coverage-summary"><p className="coverage-count">{withAchievements}<span> / {students.length}</span></p><p className="muted">Учеников с достижениями</p></div>
      <div className="coverage-track" aria-hidden="true"><span style={{ width: `${coverage}%` }} /></div>
      <div className="coverage-legend"><span>{coverage}% класса</span><span>Без достижений: {students.length - withAchievements}</span></div>
    </section>
  </div>;
}
