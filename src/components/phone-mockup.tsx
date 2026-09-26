import { Logo } from "@/components/logo";
import { RankBadge } from "@/components/rank-badge";
import { formatCents } from "@/lib/format";
import type { LeaderboardEntry } from "@/types";

export function PhoneMockup({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="relative mx-auto w-[280px] select-none" aria-hidden="true">
      <div
        className="relative rounded-[46px] p-[10px] shadow-2xl"
        style={{ background: "linear-gradient(155deg, #3a3a3d, #17171a)" }}
      >
        {/* side buttons */}
        <span className="absolute -left-[2px] top-[108px] h-8 w-[3px] rounded-l-sm bg-[#0f0f10]" />
        <span className="absolute -left-[2px] top-[148px] h-14 w-[3px] rounded-l-sm bg-[#0f0f10]" />
        <span className="absolute -right-[2px] top-[128px] h-16 w-[3px] rounded-r-sm bg-[#0f0f10]" />

        <div className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[38px] bg-background">
          <div className="absolute inset-x-0 top-0 z-20 flex justify-center pt-2.5">
            <div className="h-[20px] w-[86px] rounded-full bg-black" />
          </div>

          <div className="flex h-full flex-col pt-10">
            <div className="flex items-center justify-between px-4">
              <Logo size={18} className="scale-90" />
              <span className="rounded-full bg-accent px-2.5 py-1 text-[9px] font-semibold text-accent-foreground">
                Claim
              </span>
            </div>

            <div className="mt-3 flex-1 overflow-hidden px-2.5">
              <div className="card overflow-hidden rounded-[16px]">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 border-b border-border px-2.5 py-2 last:border-none"
                  >
                    <RankBadge rank={entry.rank} className="w-6" />
                    <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                      {entry.displayName}
                    </p>
                    <p className="tabular shrink-0 text-[11px] font-semibold text-foreground-muted">
                      {formatCents(entry.totalCents)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center pb-2 pt-3">
              <div className="h-1 w-24 rounded-full bg-foreground/25" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
