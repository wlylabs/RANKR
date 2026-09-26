import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-12 w-full rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3.5 text-[15px] text-foreground placeholder:text-foreground-subtle outline-none transition-colors duration-150",
          "focus:border-accent/60 focus:ring-2 focus:ring-accent/20",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
