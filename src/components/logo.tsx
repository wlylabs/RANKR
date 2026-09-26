import { cn } from "@/lib/cn";

interface LogoProps {
  className?: string;
  markClassName?: string;
  size?: number;
  withWordmark?: boolean;
}

/**
 * Original RANKR mark: a token disc with an ascending notch — value,
 * rising. Flat, single-color, no gradient or box, so it holds up at
 * favicon size and next to the wordmark alike.
 */
export function Logo({ className, markClassName, size = 26, withWordmark = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        className={cn("shrink-0", markClassName)}
        role="img"
        aria-label="RANKR"
      >
        <circle cx="24" cy="24" r="21" fill="var(--accent)" />
        <path
          d="M14 27L24 16L34 27"
          stroke="var(--background)"
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {withWordmark && (
        <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground">
          RANKR
        </span>
      )}
    </div>
  );
}
