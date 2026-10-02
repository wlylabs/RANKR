"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { DANGER } from "@/lib/trace/kinds";
import type { TraceLabel } from "@/lib/trace/types";
import { DecryptText } from "../DecryptText";

const KIND: Record<TraceLabel["kind"], string> = {
  cex: "CEX",
  bridge: "Bridge",
  mixer: "Mixer",
  dex: "DEX",
  contract: "Contract",
  sanctioned: "OFAC",
  hack: "Exploit",
  scam: "Scam",
  frozen: "Frozen",
  named: "Name",
};

/** A label as a mono tag and a name: "CEX Binance". Red when it means trouble. */
export function LabelTag({ label, className }: { label: TraceLabel; className?: string }) {
  const danger = DANGER.has(label.kind);
  return (
    <span className={clsx("flex min-w-0 items-center gap-1.5", className)}>
      <span
        className={clsx(
          "shrink-0 rounded-[3px] px-1 font-mono text-[9.5px] leading-[15px] tracking-wide uppercase",
          danger
            ? "bg-down text-bg"
            : label.kind === "cex"
              ? "bg-fg text-bg"
              : "border border-border-strong text-muted",
        )}
      >
        {KIND[label.kind]}
      </span>
      <span className={clsx("truncate", danger && "text-down")}>{label.name}</span>
    </span>
  );
}

const HEX = "0123456789abcdef";

/** Hex that keeps changing: a wallet being read. */
export function Scramble({ length = 10 }: { length?: number }) {
  const [text, setText] = useState("0x" + "·".repeat(length));
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(
      () => setText("0x" + Array.from({ length }, () => HEX[Math.floor(Math.random() * 16)]).join("")),
      70,
    );
    return () => clearInterval(id);
  }, [length]);
  return <span aria-hidden>{text}</span>;
}

/**
 * A whole address on one line, never cut: its type is sized to the width it has (up to `max` px), so a 44-character
 * Solana address fits a phone's card as it is. Geist Mono sets each character 0.6em wide.
 */
export function FullAddress({
  address,
  max = 14,
  decrypt,
  className,
}: {
  address: string;
  max?: number;
  /** Reveal it out of random hex on first show. */
  decrypt?: boolean;
  className?: string;
}) {
  const fontSize = `min(${max}px, calc(100cqw / ${(address.length * 0.61).toFixed(2)}))`;
  return (
    <span className="@container block min-w-0">
      <span className={clsx("block font-mono whitespace-nowrap", className)} style={{ fontSize }}>
        {decrypt ? <DecryptText text={address} duration={700} /> : address}
      </span>
    </span>
  );
}
