import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ContainerProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Container({ children, className, ...props }: ContainerProps) {
  return (
    <div
      className={cn(
        "site-container mx-auto w-full min-w-0 max-w-[1400px] px-4 sm:px-6 lg:px-10",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
