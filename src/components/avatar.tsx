import { gradientFor } from "@/lib/avatar";
import { cn } from "@/lib/cn";

interface AvatarProps {
  seed: string;
  initials: string;
  size?: number;
  ring?: boolean;
  className?: string;
}

export function Avatar({ seed, initials, size = 40, ring = false, className }: AvatarProps) {
  const [from, to] = gradientFor(seed);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        ring && "ring-2 ring-accent/50 ring-offset-2 ring-offset-surface-1",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(150deg, ${from}, ${to})`,
      }}
    >
      {initials}
    </div>
  );
}
