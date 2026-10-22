export type DemoStudent = {
  name: string;
  nuts: number;
  rank: number;
  className: string;
};

export type DemoAchievement = {
  id: string;
  title: string;
  description: string;
  earned: boolean;
};

export type DemoLeaderboardEntry = {
  rank: number;
  name: string;
  nuts: number;
  isCurrentUser?: boolean;
};

export const demoStudent: DemoStudent = {
  name: "Алекс Ривера",
  nuts: 1240,
  rank: 3,
  className: "10 класс · Management Lab",
};

export const demoAchievements: DemoAchievement[] = [
  {
    id: "first-task",
    title: "Первый Орешек",
    description: "Выполните первое задание в классе",
    earned: true,
  },
  {
    id: "streak-5",
    title: "На волне",
    description: "Зарабатывайте баллы пять дней подряд",
    earned: true,
  },
  {
    id: "team-player",
    title: "Командный игрок",
    description: "Завершите групповой челлендж вместе с классом",
    earned: false,
  },
];

export const demoLeaderboard: DemoLeaderboardEntry[] = [
  { rank: 1, name: "Майя Чен", nuts: 1580 },
  { rank: 2, name: "Йордан Блейк", nuts: 1410 },
  { rank: 3, name: "Алекс Ривера", nuts: 1240, isCurrentUser: true },
  { rank: 4, name: "Сэм Оконкво", nuts: 1120 },
  { rank: 5, name: "Райли Пак", nuts: 980 },
];

export function formatNuts(value: number): string {
  return value.toLocaleString("ru-RU");
}
