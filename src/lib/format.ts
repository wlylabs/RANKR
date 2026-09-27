const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/** $1.23K, $4.5M, $1.20B */
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const n = value / size;
      return `$${n.toFixed(Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2)}${suffix}`;
    }
  }
  return `$${value.toFixed(abs >= 100 ? 0 : abs >= 1 ? 2 : 4)}`;
}

/** Token price with DexScreener-style zero compression: $0.0₅1234 */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 1000 ? 0 : 4 })}`;
  // Number of zeros right after the decimal point: 0.00001234 -> 4
  let zeros = Math.floor(-Math.log10(value));
  if (zeros < 4) return `$${value.toFixed(zeros + 4).replace(/0+$/, "")}`;
  let digits = Math.round(value * 10 ** (zeros + 4)).toString();
  if (digits.length > 4) {
    zeros -= 1; // rounded up into the next decade, e.g. 0.0000999999
    digits = "1";
  }
  const sub = String(zeros)
    .split("")
    .map((d) => SUBSCRIPT[Number(d)])
    .join("");
  return `$0.0${sub}${digits.replace(/0+$/, "") || "0"}`;
}

/**
 * Rankr's x counts the gain, not the price ratio: 1x = +100%, 2x = +200%, 10x = +1,000%.
 * `multiple` is always price now / entry price, so a fresh paste (multiple 1) is 0%.
 */
export function gainOf(multiple: number): number {
  return multiple - 1;
}

/** "1.45x" once a token is up 100% or more; "+34.5%", "0.0%" or "-37.2%" below that. */
export function formatMultiple(multiple: number): string {
  if (!Number.isFinite(multiple)) return "—";
  const gain = gainOf(multiple);
  if (gain < 1) return formatChange(multiple);
  if (gain >= 1000) return `${Math.round(gain).toLocaleString("en-US")}x`;
  return `${gain.toFixed(gain >= 100 ? 0 : gain >= 10 ? 1 : 2)}x`;
}

/** Both forms for sentences: "1.45x (+145%)", or just the percentage below 1x. */
export function formatMove(multiple: number): string {
  return gainOf(multiple) >= 1 ? `${formatMultiple(multiple)} (${formatChange(multiple)})` : formatChange(multiple);
}

/** Percentage change for a multiple: 1.5 -> +50.0%, 0.4 -> -60.0%, 1 -> 0.0% */
export function formatChange(multiple: number): string {
  const pct = (multiple - 1) * 100;
  if (!Number.isFinite(pct)) return "—";
  const abs = Math.abs(pct);
  if (abs < 0.05) return "0.0%";
  const body =
    abs >= 10_000
      ? `${Math.round(abs).toLocaleString("en-US")}`
      : abs >= 100
        ? abs.toFixed(0)
        : abs.toFixed(1);
  return `${pct >= 0 ? "+" : "-"}${body}%`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(Math.abs(value) >= 100 ? 0 : 1)}%`;
}

export function timeAgo(timestamp: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - timestamp) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

export function tokenHref(t: { chainId: string; address: string }): string {
  return `/t/${t.chainId}/${encodeURIComponent(t.address)}`;
}
