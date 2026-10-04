// EVM JSON-RPC, for what the explorers don't say: what a contract's owner() is right now, and (on BSC, which has
// no free explorer API) whether an address is a token at all. PublicNode's free endpoints by default (no key;
// Robinhood Chain's own public RPC, which PublicNode doesn't serve), or <CHAIN>_RPC_URL (ETHEREUM_RPC_URL,
// BASE_RPC_URL, BSC_RPC_URL...).
const PUBLIC: Record<string, string> = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  arbitrum: "https://arbitrum-one-rpc.publicnode.com",
  optimism: "https://optimism-rpc.publicnode.com",
  polygon: "https://polygon-bor-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
  robinhood: "https://rpc.mainnet.chain.robinhood.com",
};

import { take } from "../budget";

const endpoint = (chain: string) => process.env[`${chain.toUpperCase()}_RPC_URL`]?.trim() || PUBLIC[chain];

/** owner(), totalSupply() */
const OWNER = "0x8da5cb5b";
const TOTAL_SUPPLY = "0x18160ddd";
const BURNED = /^0x0{40}$|^0x0{36}dead$/i;

/** eth_call: the result's hex, "revert" when the call reverts, undefined when the chain can't be asked. */
async function call(chain: string, to: string, data: string): Promise<string | "revert" | undefined> {
  const url = endpoint(chain);
  if (!url || !(await take("publicnode"))) return undefined;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { result?: string; error?: { message?: string } };
    if (body.error) return /revert/i.test(body.error.message ?? "") ? "revert" : undefined;
    return body.result ?? "0x";
  } catch {
    return undefined;
  }
}

/**
 * Who owns `contract` now: an address, "renounced" (the zero or dead address), or "none" (it has no owner()).
 * undefined when the chain can't be asked.
 */
export async function ownerOf(chain: string, contract: string): Promise<string | "renounced" | "none" | undefined> {
  const hex = await call(chain, contract, OWNER);
  if (hex === undefined) return undefined;
  if (hex === "revert" || hex.length < 66) return "none";
  const owner = `0x${hex.slice(-40)}`;
  return BURNED.test(owner) ? "renounced" : owner;
}

/** Whether `address` answers totalSupply() like a token; undefined when the chain can't be asked. */
export async function isToken(chain: string, address: string): Promise<boolean | undefined> {
  const hex = await call(chain, address, TOTAL_SUPPLY);
  if (hex === undefined) return undefined;
  return hex !== "revert" && hex.length >= 66;
}
