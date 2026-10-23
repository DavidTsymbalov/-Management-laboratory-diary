import type { AchievementIcon } from "@/data/seed";
import { cn } from "@/lib/cn";

const ICONS: Record<AchievementIcon, string> = {
  plus: "/badges/ach-plus.png",
  bolt: "/badges/ach-bolt.png",
  cross: "/badges/ach-cross.png",
};

type AchievementBadgeProps = {
  icon?: AchievementIcon;
  title: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};

/** PNG 100×100 — компактно: ~20 / 24 / 28 px */
const ICON = {
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-7 w-7",
} as const;

export function AchievementBadge({
  icon = "plus",
  title,
  className,
  size = "md",
}: AchievementBadgeProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-full",
          ICON[size],
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ICONS[icon]}
          alt=""
          className="h-full w-full scale-[1.18] object-cover"
          draggable={false}
        />
      </div>
      <span className="text-sm font-medium text-[#e5dac3]">
        {title}
      </span>
    </div>
  );
}

export function pickAchievementIcon(seed: string): AchievementIcon {
  const icons: AchievementIcon[] = ["plus", "bolt", "cross"];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % 97;
  }
  return icons[hash % icons.length];
}
