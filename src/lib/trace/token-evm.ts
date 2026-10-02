// An EVM token's contract and holders, over Blockscout (evm.ts) and Honeypot.is: the contract (verified, a
// proxy, flagged, who deployed it), its token info and top 50 holders, a simulated buy and sell, and, for a v2
// pool, who holds its LP tokens (burned, locked in a locker, or in someone's wallet). Five Blockscout requests.
import { sameAddress } from "../address";
import type { Pair } from "../dexscreener";
import type { TraceChain } from "./chains";
import { TraceError } from "./errors";
import { blockscout, blockscoutLabel, units, type AddressInfo, type AddressParam, type Page } from "./evm";
import { simulateTrade } from "./honeypot";
import { labelOf } from "./labels";
import type { RawHolder, TokenFacts } from "./token-assess";

type TokenInfo = {
  name?: string | null;
  symbol?: string | null;
  type?: string | null;
  decimals?: string | null;
  total_supply?: string | null;
  holders_count?: string | null;
  holders?: string | null;
};
type Holder = { address: AddressParam; value: string };
type ContractInfo = AddressInfo & {
  creator_address_hash?: string | null;
  is_verified?: boolean | null;
  proxy_type?: string | null;
  implementations?: unknown[] | null;
};

/** Burn addresses: tokens sent here are gone. */
const BURN = /^0x0{40}$|^0x0{36}dead$/i;
/** Liquidity lockers, by the names their contracts go by on the explorers. */
const LOCKER = /lock|unicrypt|uncx|team ?finance|pinksale|gempad|mudra|trustswap/i;

const int = (v: string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A v2 pool's LP tokens: shares burned and locked. undefined when the pool isn't an LP token (v3, v4). */
async function lpOf(chain: TraceChain, pair: string): Promise<TokenFacts["lp"]> {
  try {
    const [token, page] = await Promise.all([
      blockscout<TokenInfo>(chain, `/tokens/${pair}`),
      blockscout<Page<Holder>>(chain, `/tokens/${pair}/holders`),
    ]);
    if (!token || token.type !== "ERC-20") return undefined;
    const decimals = int(token.decimals) ?? 18;
    const supply = units(token.total_supply, decimals);
    if (!(supply > 0)) return undefined;
    let burned = 0;
    let locked = 0;
    for (const h of page?.items ?? []) {
      const share = (units(h.value, decimals) / supply) * 100;
      if (BURN.test(h.address.hash)) burned += share;
      else if (h.address.is_contract && LOCKER.test(`${h.address.name ?? ""} ${h.address.implementation_name ?? ""}`))
        locked += share;
    }
    return { burnedPct: burned, lockedPct: locked };
  } catch (err) {
    if (err instanceof TraceError && err.code === "nokey") throw err;
    return null;
  }
}

export async function evmTokenFacts(
  chain: TraceChain,
  address: string,
  pairs: Pair[],
): Promise<Pick<TokenFacts, "contract" | "holders" | "lp" | "creator" | "name" | "symbol">> {
  const best = pairs[0];
  const [info, token, page, sim, lp] = await Promise.all([
    blockscout<ContractInfo>(chain, `/addresses/${address}`),
    blockscout<TokenInfo>(chain, `/tokens/${address}`),
    blockscout<Page<Holder>>(chain, `/tokens/${address}/holders`).catch((err) => {
      if (err instanceof TraceError && err.code === "nokey") throw err;
      return undefined;
    }),
    simulateTrade(chain.id, address, best?.pairAddress),
    best ? lpOf(chain, best.pairAddress) : undefined,
  ]);
  if (!token && !info?.token) throw new TraceError("invalid", "That isn't a token's address.");

  const creator = info?.creator_address_hash ?? null;
  const decimals = int(token?.decimals) ?? 18;
  const supply = units(token?.total_supply, decimals);
  const pools = pairs.map((p) => p.pairAddress);
  const list: RawHolder[] = (page?.items ?? []).map((h) => ({
    address: h.address.hash,
    amount: units(h.value, decimals),
    role: BURN.test(h.address.hash)
      ? "burn"
      : pools.some((p) => sameAddress(p, h.address.hash))
        ? "pool"
        : creator && sameAddress(creator, h.address.hash)
          ? "creator"
          : null,
    label: labelOf(chain.id, h.address.hash) ?? blockscoutLabel(h.address),
  }));

  return {
    name: token?.name ?? null,
    symbol: token?.symbol ?? null,
    contract: {
      kind: "evm",
      verified: info?.is_verified ?? null,
      proxy: !!(info?.proxy_type || info?.implementations?.length),
      scam: !!(info?.is_scam || info?.reputation === "scam"),
      sim,
    },
    holders:
      page && supply > 0 ? { supply, count: int(token?.holders_count ?? token?.holders), list } : null,
    lp,
    creator,
  };
}
