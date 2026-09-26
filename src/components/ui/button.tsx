import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-gold-300 to-gold-600 text-accent-foreground font-semibold shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_24px_-8px_rgba(216,178,100,0.55)] hover:brightness-[1.06] active:brightness-95",
  secondary:
    "glass-panel text-foreground hover:border-border-strong hover:bg-white/[0.06]",
  ghost:
    "text-foreground-muted hover:text-foreground hover:bg-white/[0.04]",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-11 px-5 text-[14px] gap-2 rounded-[var(--radius-md)]",
  lg: "h-12 px-7 text-[15px] gap-2 rounded-[var(--radius-md)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap font-medium transition-all duration-200 ease-out disabled:opacity-40 disabled:pointer-events-none select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
