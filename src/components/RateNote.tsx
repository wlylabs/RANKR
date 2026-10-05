"use client";

import clsx from "clsx";
import { useMoney } from "@/lib/currency";

/**
 * The rupiah rate in use, when amounts are shown in rupiah, with the credit its source asks for; or, with rupiah
 * picked and no rate to be had, that amounts are in dollars.
 */
export function RateNote({ className }: { className?: string }) {
  const money = useMoney();
  if (money.rateMissing) {
    return <p className={clsx("text-[11px] text-subtle", className)}>No rupiah rate right now: amounts are in dollars.</p>;
  }
  if (money.shown !== "idr" || !money.rate) return null;
  const r = money.rate;
  return (
    <p className={clsx("text-[11px] text-subtle", className)}>
      $1 = {money.format(1)}
      {r.date && ` · ${r.date}`} ·{" "}
      {r.credit ? (
        <a href={r.credit.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-fg hover:underline">
          {r.credit.text}
        </a>
      ) : (
        r.source
      )}
    </p>
  );
}
