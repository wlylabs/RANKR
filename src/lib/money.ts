// Amounts in USD, shown in dollars or rupiah: plain functions, for the browser and for the server's cards alike.
import { formatUsd } from "./format";

export type Currency = "usd" | "idr";

const IDR = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
// From a billion, written out ("miliar"): the short "M" reads as million in English.
const IDR_LONG = new Intl.NumberFormat("id-ID", { notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 });
const IDR_SHORT = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const USD = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * An amount in USD, shown in `currency`: "$1,234.56" (from $100K: "$1.23M"), or "Rp1.650.000" (from a billion:
 * "Rp1,6 miliar"). `signed`: "+" before a gain, "-" before a loss. Rupiah needs `usdIdr`; without it, dollars.
 * Rupiah are at one rate, today's, for every amount: a paper trade's profit doesn't move with the exchange rate.
 * `short`, for tight spots: "$140", "$1.2K"; "Rp2,7 jt", "Rp740 rb".
 */
export function formatMoney(
  usd: number,
  currency: Currency,
  usdIdr: number | null,
  { signed = false, short = false } = {},
): string {
  if (!Number.isFinite(usd)) return "—";
  const abs = Math.abs(usd);
  const idr = currency === "idr" && usdIdr ? abs * usdIdr : null;
  // No sign on what shows as nothing ("$0.00", not "-$0.00").
  const zero = idr !== null ? idr < 0.5 : abs < 0.005;
  const sign = zero ? "" : signed && usd > 0 ? "+" : usd < 0 ? "-" : "";
  if (idr !== null) {
    // Short only below what would round up to "1 M" (a miliar, which reads as a million in English).
    if (short && idr < 999_950_000) return `${sign}Rp${IDR_SHORT.format(idr).replace(/\u00a0/g, " ")}`;
    return `${sign}Rp${(idr >= (short ? 999_950_000 : 1e9) ? IDR_LONG : IDR).format(idr).replace(/\u00a0/g, " ")}`;
  }
  return abs >= 100_000 || (short && abs >= 1) ? `${sign}${formatUsd(abs)}` : `${sign}$${USD.format(abs)}`;
}
