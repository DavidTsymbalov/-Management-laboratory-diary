import { cn } from "@/lib/cn";
import { publicUrl } from "@/lib/public-url";

type NutsBadgeProps = {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** PNG 100×100 — держим близко к нативу, без апскейла в 2×+ */
const SIZES = {
  sm: { box: "h-12 w-12", text: "text-lg" },
  md: { box: "h-[4.5rem] w-[4.5rem]", text: "text-2xl" },
  lg: { box: "h-28 w-28 sm:h-[7.5rem] sm:w-[7.5rem]", text: "text-4xl sm:text-5xl" },
} as const;

export function NutsBadge({ value, size = "lg", className }: NutsBadgeProps) {
  const dim = SIZES[size];

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        dim.box,
        className,
      )}
      aria-label={`${value} баллов`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={publicUrl("/badges/nuts-circle.png")}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full scale-[1.18] select-none object-cover"
        draggable={false}
      />
      <span
        className={cn(
          "relative z-10 font-display font-bold leading-none tabular-nums text-white",
          "drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]",
          String(Math.abs(value)).length > 5 ? "text-xl sm:text-2xl" : String(Math.abs(value)).length > 3 ? "text-2xl sm:text-3xl" : dim.text,
        )}
      >
        {value}
      </span>
    </div>
  );
}
