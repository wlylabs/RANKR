// Honeypot.is (api.honeypot.is, no key): it simulates a buy and a sell of a token and reports whether the sell
// went through, the taxes taken, whether its code is open source or a proxy, and its holders. Ethereum, Base and
// BSC among Trace's chains. One call per EVM token report.
import { take } from "../budget";
import type { EvmContract } from "./token-assess";

const API = () => (process.env.HONEYPOT_API_URL ?? "https://api.honeypot.is").replace(/\/+$/, "");

/** The chains it simulates on, by its chain ids. */
export const HONEYPOT_CHAINS: Record<string, number> = { ethereum: 1, base: 8453, bsc: 56 };

type Body = {
  simulationSuccess?: boolean;
  honeypotResult?: { isHoneypot?: boolean; honeypotReason?: string | null };
  simulationResult?: { buyTax?: number; sellTax?: number; transferTax?: number };
  contractCode?: { openSource?: boolean; rootOpenSource?: boolean; isProxy?: boolean };
  token?: { totalHolders?: number };
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * A test buy and sell of `token` through `pair` (its main pool, when known). undefined: not on this chain;
 * null: the simulation couldn't run (or Honeypot.is couldn't be reached).
 */
export async function simulateTrade(chain: string, token: string, pair?: string): Promise<EvmContract["sim"]> {
  const id = HONEYPOT_CHAINS[chain];
  if (!id) return undefined;
  // Over its per-minute budget: not run, like a simulation that couldn't.
  if (!(await take("honeypot"))) return null;
  try {
    const q = new URLSearchParams({ address: token, chainID: String(id), ...(pair && { pair }) });
    const res = await fetch(`${API()}/v2/IsHoneypot?${q}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Body;
    if (body.simulationSuccess === false && !body.honeypotResult?.isHoneypot) return null;
    return {
      honeypot: !!body.honeypotResult?.isHoneypot,
      reason: body.honeypotResult?.honeypotReason || null,
      buyTax: num(body.simulationResult?.buyTax),
      sellTax: num(body.simulationResult?.sellTax),
      transferTax: num(body.simulationResult?.transferTax),
      openSource: typeof body.contractCode?.openSource === "boolean" ? body.contractCode.openSource : null,
      proxy: typeof body.contractCode?.isProxy === "boolean" ? body.contractCode.isProxy : null,
      holders: num(body.token?.totalHolders),
    };
  } catch (err) {
    console.warn("[rankr] trace: honeypot.is unavailable:", (err as Error).message);
    return null;
  }
}
