// An EVM token over Blockscout (evm.ts), Honeypot.is and a public RPC: the contract (verified, a proxy, flagged,
// who deployed it, what its owner can still do), its token info and top 50 holders, a simulated buy and sell, for
// a v2 pool who holds its LP tokens, its first trades (bundles and snipers), who first funded the biggest holders,
// and the deployer's other tokens. Each part is read on its own: one that fails is left out, the rest stays.
// About 15 to 30 Blockscout requests.
import { sameAddress } from "../address";
import { fetchSnapshots, type Pair } from "../dexscreener";
import type { TraceChain } from "./chains";
import { TraceError } from "./errors";
import {
  blockscout,
  blockscoutLabel,
  blockscoutRpc,
  evmFunder,
  units,
  type AddressInfo,
  type AddressParam,
  type Page,
} from "./evm";
import { ownerOf } from "./evm-rpc";
import { simulateTrade } from "./honeypot";
import { labelOf } from "./labels";
import { mapLimit } from "./solana";
import { SNIPER_BLOCKS, type LaunchBuy, type LaunchFacts, type OwnerPower, type RawHolder, type TokenFacts } from "./token-assess";

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
  implementations?: { address?: string | null; address_hash?: string | null }[] | null;
};
type AbiItem = { type?: string; name?: string; stateMutability?: string };
type SmartContract = { abi?: AbiItem[] | null };
type CreatorTx = { created_contract?: AddressParam | null };
/** A transfer as the Etherscan-compatible API lists it. */
type Transfer = { blockNumber: string; timeStamp: string; from: string; to: string; value: string; tokenDecimal?: string };

/** Burn addresses: tokens sent here are gone. */
const BURN = /^0x0{40}$|^0x0{36}dead$/i;
/** Liquidity lockers, by the names their contracts go by on the explorers. */
const LOCKER = /lock|unicrypt|uncx|team ?finance|pinksale|gempad|mudra|trustswap/i;

const int = (v: string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Keeps "no key" loud (the report can't go without it) and turns any other failure into null. */
const soft = <T>(p: Promise<T>): Promise<T | null> =>
  p.catch((err) => {
    if (err instanceof TraceError && err.code === "nokey") throw err;
    return null;
  });

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

/**
 * What its functions let an owner or admin do, by their names in the verified ABI (Token Sniffer's owner
 * permission scan, by name): mint, block wallets, stop trading, change the tax, cap sells. Functions that only
 * read aren't counted, nor a one-way switch on (openTrading, enableTrading).
 */
const POWERS: [OwnerPower, RegExp][] = [
  ["mint", /^_?mint(To)?$|^issue$/i],
  ["blacklist", /black.?list|block.?list|^(set|add|remove|del)Bots?$|^ban/i],
  ["pause", /^(pause|setTrading(Enabled|Open)?|toggleTrading|disableTrading|setSwapEnabled|stopTrading)$/i],
  ["fees", /^(set|update|change)\w*(fee|tax)/i],
  ["limits", /^(set|update|change)\w*(max(Tx|Wallet|Transaction|Sell|Buy)|limit)/i],
];

export function powersOf(abi: AbiItem[]): OwnerPower[] {
  const writes = abi
    .filter((i) => i.type === "function" && i.name && i.stateMutability !== "view" && i.stateMutability !== "pure")
    .map((i) => i.name!);
  return POWERS.filter(([, re]) => writes.some((n) => re.test(n))).map(([p]) => p);
}

/** Its ABI and, behind a proxy, its implementation's: the functions it actually runs. Null when unverified. */
async function abiOf(chain: TraceChain, info: ContractInfo | null, address: string): Promise<AbiItem[] | null> {
  const own = await blockscout<SmartContract>(chain, `/smart-contracts/${address}`);
  const impl = info?.implementations?.[0];
  const implAddress = impl?.address_hash ?? impl?.address ?? null;
  const behind = implAddress ? await blockscout<SmartContract>(chain, `/smart-contracts/${implAddress}`) : null;
  const abi = [...(own?.abi ?? []), ...(behind?.abi ?? [])];
  return abi.length ? abi : null;
}

/**
 * Its first trades: the pool's transfers of the token, oldest first (Blockscout's Etherscan-compatible API). The
 * launch is the first block the pool sends tokens out (a buy); buys in it are a bundle, buys in the next few
 * blocks are snipers.
 */
export function readEvmLaunch(transfers: Transfer[], pool: string, decimals: number): LaunchFacts {
  const buys = transfers.filter((t) => sameAddress(t.from, pool) && !sameAddress(t.to, pool) && !BURN.test(t.to));
  const first = buys[0];
  if (!first) return { reached: true, at: null, buys: [] };
  const start = Number(first.blockNumber);
  const out: LaunchBuy[] = [];
  for (const t of buys) {
    const block = Number(t.blockNumber);
    if (block > start + SNIPER_BLOCKS) break;
    out.push({
      wallet: t.to,
      amount: units(t.value, int(t.tokenDecimal ?? null) ?? decimals),
      phase: block === start ? "bundle" : "sniper",
    });
  }
  return { reached: true, at: Number(first.timeStamp) * 1000 || null, buys: out };
}

async function evmLaunch(chain: TraceChain, token: string, pool: string, decimals: number): Promise<LaunchFacts | null> {
  // A Uniswap v4 pool id isn't an address: nothing to list.
  if (!/^0x[0-9a-f]{40}$/i.test(pool)) return null;
  const transfers = await blockscoutRpc<Transfer>(chain, {
    module: "account",
    action: "tokentx",
    address: pool,
    contractaddress: token,
    sort: "asc",
    page: "1",
    offset: "300",
  });
  return transfers ? readEvmLaunch(transfers, pool, decimals) : null;
}

/** Who first funded the biggest holders (pools, burns and exchanges aside), a few at a time. */
async function links(chain: TraceChain, list: RawHolder[], supply: number): Promise<TokenFacts["links"]> {
  const wallets = list
    .filter((h) => (!h.role || h.role === "creator") && !h.label && h.amount / supply >= 0.003)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
  if (!wallets.length) return [];
  const funders = await mapLimit(wallets, 3, (h) => evmFunder(chain, h.address).catch(() => undefined));
  if (funders.every((f) => f === undefined)) return null;
  return wallets.map((h, i) => ({ holder: h.address, funder: funders[i] ?? null }));
}

/**
 * The deployer's other tokens (in its newest 50 transactions), and how many have no pool worth $1K anymore. Not
 * read when the deployer is a contract: a launchpad's factory deploys everyone's tokens.
 */
async function history(chain: TraceChain, creator: string, token: string): Promise<TokenFacts["history"]> {
  const [who, page] = await Promise.all([
    blockscout<AddressParam>(chain, `/addresses/${creator}`),
    blockscout<Page<CreatorTx>>(chain, `/addresses/${creator}/transactions`),
  ]);
  if (who?.is_contract) return null;
  const created = [
    ...new Set(
      (page?.items ?? [])
        .map((t) => t.created_contract?.hash)
        .filter((h): h is string => !!h && !sameAddress(h, token)),
    ),
  ].slice(0, 8);
  if (!created.length) return { tokens: 0, dead: 0 };
  const infos = await mapLimit(created, 3, (c) => blockscout<TokenInfo>(chain, `/tokens/${c}`).catch(() => null));
  const tokens = created.filter((_, i) => infos[i]?.type === "ERC-20");
  if (!tokens.length) return { tokens: 0, dead: 0 };
  const snaps = await fetchSnapshots(tokens.map((address) => ({ chainId: chain.id, address })));
  const alive = (t: string) =>
    [...snaps.values()].some((s) => sameAddress(s.address, t) && (s.liquidityUsd ?? 0) >= 1_000);
  return { tokens: tokens.length, dead: tokens.filter((t) => !alive(t)).length };
}

export async function evmTokenFacts(
  chain: TraceChain,
  address: string,
  pairs: Pair[],
): Promise<
  Pick<TokenFacts, "contract" | "holders" | "lp" | "creator" | "name" | "symbol" | "launch" | "links" | "history">
> {
  const best = pairs[0];
  const [info, token, page, sim, lp, owner] = await Promise.all([
    blockscout<ContractInfo>(chain, `/addresses/${address}`),
    blockscout<TokenInfo>(chain, `/tokens/${address}`),
    soft(blockscout<Page<Holder>>(chain, `/tokens/${address}/holders`)),
    simulateTrade(chain.id, address, best?.pairAddress),
    best ? lpOf(chain, best.pairAddress) : undefined,
    ownerOf(chain.id, address),
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

  const [abi, launch, linked, past] = await Promise.all([
    info?.is_verified === false ? null : soft(abiOf(chain, info, address)),
    best ? soft(evmLaunch(chain, address, best.pairAddress, decimals)) : undefined,
    page && supply > 0 ? soft(links(chain, list, supply)) : null,
    creator ? soft(history(chain, creator, address)) : undefined,
  ]);

  return {
    name: token?.name ?? null,
    symbol: token?.symbol ?? null,
    contract: {
      kind: "evm",
      verified: info?.is_verified ?? null,
      proxy: !!(info?.proxy_type || info?.implementations?.length),
      scam: !!(info?.is_scam || info?.reputation === "scam"),
      sim,
      owner,
      powers: abi ? powersOf(abi) : null,
    },
    holders: page && supply > 0 ? { supply, count: int(token?.holders_count ?? token?.holders), list } : null,
    lp,
    creator,
    launch: launch ?? null,
    links: linked,
    history: past ?? null,
  };
}
