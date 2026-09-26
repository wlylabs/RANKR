import { cn } from "@/lib/cn";

interface AvatarProps {
  initials: string;
  color: string;
  size?: number;
  ring?: boolean;
  className?: string;
}

export function Avatar({ initials, color, size = 40, ring = false, className }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white/90",
        ring && "ring-2 ring-gold-500/50 ring-offset-2 ring-offset-surface-1",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(155deg, ${color}, ${color}CC)`,
      }}
    >
      {initials}
    </div>
  );
}
