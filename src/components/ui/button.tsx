import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ScrambleText } from "@/components/motion/scramble-text";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "action primary border border-accent bg-accent text-accent-foreground hover:bg-accent/90",
  secondary:
    "action secondary border border-border bg-surface text-foreground hover:bg-accent-soft",
  /** Только текст — scramble вместо подчёркивания */
  ghost: "quiet-action bg-transparent text-foreground hover:text-accent",
} as const;

const sizes = {
  sm: "min-h-11 px-3 py-2 text-xs tracking-[0.12em] uppercase sm:min-h-9 sm:px-1.5 sm:py-1",
  md: "min-h-11 px-3 py-2 text-sm sm:px-1.5",
  lg: "min-h-12 px-3 py-2 text-sm tracking-[0.06em] sm:px-1.5",
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
  return <><span className="sm:hidden">{children}</span><ScrambleText text={children} className="max-sm:!hidden" /></>;
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
    "group inline-flex max-w-full items-center justify-center gap-2 rounded-sm text-center font-semibold whitespace-normal [overflow-wrap:anywhere] transition duration-200",
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
