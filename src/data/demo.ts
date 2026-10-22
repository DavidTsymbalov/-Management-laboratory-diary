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
  name: "Alex Rivera",
  nuts: 1240,
  rank: 3,
  className: "Year 10 · Management Lab",
};

export const demoAchievements: DemoAchievement[] = [
  {
    id: "first-task",
    title: "First Nut",
    description: "Complete your first classroom task",
    earned: true,
  },
  {
    id: "streak-5",
    title: "On a Roll",
    description: "Earn points five days in a row",
    earned: true,
  },
  {
    id: "team-player",
    title: "Team Player",
    description: "Finish a group challenge with your class",
    earned: false,
  },
];

export const demoLeaderboard: DemoLeaderboardEntry[] = [
  { rank: 1, name: "Maya Chen", nuts: 1580 },
  { rank: 2, name: "Jordan Blake", nuts: 1410 },
  { rank: 3, name: "Alex Rivera", nuts: 1240, isCurrentUser: true },
  { rank: 4, name: "Sam Okonkwo", nuts: 1120 },
  { rank: 5, name: "Riley Park", nuts: 980 },
];
