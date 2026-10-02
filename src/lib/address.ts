export type ParsedInput = { address: string; chainHint: string | null };

const EVM = /^0x[a-fA-F0-9]{40}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SUI = /^0x[a-fA-F0-9]{1,64}::[A-Za-z0-9_]+::[A-Za-z0-9_]+$/;
const TON = /^(EQ|UQ)[A-Za-z0-9_-]{46}$/;

// Path prefixes used by explorers / trading terminals -> DexScreener chain id.
const GMGN_CHAINS: Record<string, string> = { sol: "solana", eth: "ethereum", base: "base", bsc: "bsc", tron: "tron" };
const EXPLORER_CHAINS: Record<string, string> = {
  "solscan.io": "solana",
  "etherscan.io": "ethereum",
  "basescan.org": "base",
  "bscscan.com": "bsc",
  "arbiscan.io": "arbitrum",
  "polygonscan.com": "polygon",
  "optimistic.etherscan.io": "optimism",
};

export function isAddress(value: string): boolean {
  return EVM.test(value) || BASE58.test(value) || SUI.test(value) || TON.test(value);
}

export function isEvmAddress(value: string): boolean {
  return EVM.test(value);
}

/** Stable key for a token: EVM addresses are case-insensitive, the rest are not. */
export function tokenId(chainId: string, address: string): string {
  return `${chainId}:${isEvmAddress(address) ? address.toLowerCase() : address}`;
}

export function sameAddress(a: string, b: string): boolean {
  return isEvmAddress(a) && isEvmAddress(b) ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Accepts a raw contract address or a link from the usual places people copy CAs from
 * (pump.fun, DexScreener, GMGN, Birdeye, explorers) and returns the address inside it.
 */
export function parseInput(raw: string): ParsedInput | null {
  const value = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!value) return null;
  if (isAddress(value)) return { address: value, chainHint: null };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!url.hostname.includes(".")) return null;

  const host = url.hostname.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let chainHint: string | null = null;

  if (host === "dexscreener.com" && segments.length >= 2) chainHint = segments[0];
  else if (host === "gmgn.ai" && segments.length >= 2) chainHint = GMGN_CHAINS[segments[0]] ?? null;
  else if (host.endsWith("pump.fun") || host === "photon-sol.tinyastro.io") chainHint = "solana";
  else if (host === "birdeye.so") chainHint = url.searchParams.get("chain") ?? "solana";
  else if (EXPLORER_CHAINS[host]) chainHint = EXPLORER_CHAINS[host];

  const fromQuery = ["address", "token", "ca", "outputMint"].map((k) => url.searchParams.get(k));
  const candidates = [...segments].reverse().concat(fromQuery.filter((v): v is string => !!v));
  const address = candidates.find(isAddress);
  return address ? { address, chainHint } : null;
}
