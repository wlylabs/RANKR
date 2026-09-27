"use client";

import { useNow } from "@/lib/hooks";
import { formatDate, timeAgo } from "@/lib/format";

export function TimeAgo({ at, className }: { at: number; className?: string }) {
  const now = useNow();
  return (
    <time dateTime={new Date(at).toISOString()} title={formatDate(at)} className={className} suppressHydrationWarning>
      {timeAgo(at, now)}
    </time>
  );
}
