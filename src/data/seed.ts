export type AchievementIcon = "plus" | "bolt" | "cross";

export type Achievement = {
  id: string;
  title: string;
  earnedAt: string;
  icon?: AchievementIcon;
};

export type Student = {
  id: string;
  name: string;
  /** Пароль для входа в личный кабинет */
  password: string;
  nuts: number;
  achievements: Achievement[];
};

export const TEACHER = {
  username: "Андрей Лякин",
  password: "LBM",
} as const;

export const DEFAULT_STUDENT_PASSWORD = "1111";

/** Старт пустой — учеников добавляет учитель */
export const SEED_STUDENTS: Student[] = [];
