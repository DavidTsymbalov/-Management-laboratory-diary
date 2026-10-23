import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ScrambleText } from "@/components/motion/scramble-text";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "border border-[#e5dac3]/60 bg-transparent text-[#e5dac3] hover:bg-[#e5dac3]/10",
  secondary:
    "border border-[#e5dac3]/35 bg-surface text-[#e5dac3] hover:bg-accent-soft",
  /** Только текст — scramble вместо подчёркивания */
  ghost: "btn-text bg-transparent text-[#e5dac3] hover:bg-transparent",
} as const;

const sizes = {
  sm: "h-9 px-1.5 text-xs tracking-[0.12em] uppercase",
  md: "h-11 px-1.5 text-sm",
  lg: "h-12 px-1.5 text-sm tracking-[0.06em]",
} as const;

type ButtonVariant = keyof typeof variants;
type ButtonSize = keyof typeof sizes;

type CommonProps = {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps & {
  href: string;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

function wrapGhostLabel(children: ReactNode, ghost: boolean) {
  if (!ghost || typeof children !== "string") return children;
  return <ScrambleText text={children} />;
}

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  const isGhost = variant === "ghost";
  const classes = cn(
    "group inline-flex items-center justify-center gap-2 rounded-sm font-semibold transition duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-45",
    variants[variant],
    sizes[size],
    className,
  );

  const label = wrapGhostLabel(children, isGhost);

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={classes}>
        {label}
      </Link>
    );
  }

  return (
    <button className={classes} {...(props as ButtonAsButton)}>
      {label}
    </button>
  );
}
