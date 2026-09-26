"use client";

import { motion } from "framer-motion";
import { Users, Coins, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatPill } from "@/components/stat-pill";
import { formatCentsCompact } from "@/lib/format";

interface HeroProps {
  entrantCount: number;
  totalPooledCents: number;
  topAmountCents: number;
  onClaim: () => void;
}

export function Hero({ entrantCount, totalPooledCents, topAmountCents, onClaim }: HeroProps) {
  return (
    <section className="mx-auto max-w-5xl px-4 pb-10 pt-14 sm:px-6 sm:pt-20">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl"
      >
        <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-[12px] font-medium text-foreground-muted">
          The leaderboard where value talks
        </span>
        <h1 className="mt-5 text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-[56px]">
          Every dollar
          <br />
          moves you <span className="accent-text">up.</span>
        </h1>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-foreground-muted">
          Claim your rank with a contribution. Outbid the entrant above you to rise —
          get outbid, and you slide back down. No ties, no shortcuts, just value.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onClaim}>
            Claim Your Rank
          </Button>
          <a
            href="#leaderboard"
            className="text-[14px] font-medium text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
          >
            View leaderboard
          </a>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <StatPill
          label="Entrants"
          value={entrantCount.toLocaleString()}
          icon={<Users size={18} strokeWidth={1.75} />}
        />
        <StatPill
          label="Pooled value"
          value={formatCentsCompact(totalPooledCents)}
          icon={<Coins size={18} strokeWidth={1.75} />}
        />
        <StatPill
          label="Current #1"
          value={formatCentsCompact(topAmountCents)}
          icon={<TrendingUp size={18} strokeWidth={1.75} />}
        />
      </motion.div>
    </section>
  );
}
