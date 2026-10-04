// Rankr starts clean every month: at 00:00 UTC on the 1st every token, call and milestone is cleared
// (rankr_end_month, scheduled with pg_cron). Accounts stay. Browser and server.

/** When the next reset is: 00:00 UTC on the 1st of the coming month. */
export function nextResetAt(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** "2026-09-01" -> "September 2026". */
export function monthLabel(month: string): string {
  return new Date(`${month.slice(0, 10)}T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Oct 1" for a reset time. */
export function resetDay(at: number): string {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** How long until `at`: "3d 4h", "5h", "12m". */
export function untilLabel(at: number, now = Date.now()): string {
  const m = Math.max(1, Math.ceil((at - now) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}
