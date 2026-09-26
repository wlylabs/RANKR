import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StatPillProps {
  label: string;
  value: string;
  icon?: ReactNode;
  className?: string;
}

export function StatPill({ label, value, icon, className }: StatPillProps) {
  return (
    <div
      className={cn(
        "glass-panel flex items-center gap-3 rounded-[var(--radius-md)] px-4 py-3",
        className,
      )}
    >
      {icon && <span className="text-gold-500">{icon}</span>}
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground-subtle">
          {label}
        </p>
        <p className="tabular truncate text-[17px] font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
