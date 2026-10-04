import clsx from "clsx";

/** Ticker + name, the only identity a token gets (no logos). */
export function TokenName({ symbol, name, className }: { symbol: string; name: string; className?: string }) {
  return (
    <span className={clsx("flex min-w-0 items-baseline gap-2", className)}>
      <span className="shrink-0 font-medium">${symbol}</span>
      <span className="truncate text-sm text-muted">{name}</span>
    </span>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-40 rounded" />
            <div className="skeleton h-2.5 w-28 rounded" />
          </div>
          <div className="skeleton h-3 w-12 rounded" />
        </div>
      ))}
    </div>
  );
}
