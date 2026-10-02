// EVM JSON-RPC, for the one thing the explorers don't say: what a contract's owner() is right now. PublicNode's
// free endpoints by default (no key), or <CHAIN>_RPC_URL (ETHEREUM_RPC_URL, BASE_RPC_URL...).
const PUBLIC: Record<string, string> = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  arbitrum: "https://arbitrum-one-rpc.publicnode.com",
  optimism: "https://optimism-rpc.publicnode.com",
  polygon: "https://polygon-bor-rpc.publicnode.com",
};

const endpoint = (chain: string) => process.env[`${chain.toUpperCase()}_RPC_URL`]?.trim() || PUBLIC[chain];

/** owner() */
const OWNER = "0x8da5cb5b";
const BURNED = /^0x0{40}$|^0x0{36}dead$/i;

/**
 * Who owns `contract` now: an address, "renounced" (the zero or dead address), or "none" (it has no owner()).
 * undefined when the chain can't be asked.
 */
export async function ownerOf(chain: string, contract: string): Promise<string | "renounced" | "none" | undefined> {
  const url = endpoint(chain);
  if (!url) return undefined;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: contract, data: OWNER }, "latest"] }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { result?: string; error?: { message?: string } };
    // A revert: no owner() to call.
    if (body.error) return /revert/i.test(body.error.message ?? "") ? "none" : undefined;
    const hex = body.result ?? "0x";
    if (hex.length < 66) return "none";
    const owner = `0x${hex.slice(-40)}`;
    return BURNED.test(owner) ? "renounced" : owner;
  } catch {
    return undefined;
  }
}
