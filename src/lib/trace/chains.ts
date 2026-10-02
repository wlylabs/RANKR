import { isEvmAddress, parseInput } from "../address";

// The chains a wallet can be traced on: Solana over its public RPC (free, no key), and the EVM chains that
// Blockscout's API covers (a free key). Ids are DexScreener's, like everywhere else in Rankr.

export type TraceChain = {
  id: string;
  kind: "solana" | "evm";
  /** The native coin's ticker. */
  native: string;
  /** Blockscout's chain id (EVM only). */
  chainId?: number;
  /** Block explorer, for "open in explorer". */
  explorer: string;
};

export const TRACE_CHAINS: TraceChain[] = [
  { id: "solana", kind: "solana", native: "SOL", explorer: "https://solscan.io" },
  { id: "ethereum", kind: "evm", native: "ETH", chainId: 1, explorer: "https://etherscan.io" },
  { id: "base", kind: "evm", native: "ETH", chainId: 8453, explorer: "https://basescan.org" },
  { id: "arbitrum", kind: "evm", native: "ETH", chainId: 42161, explorer: "https://arbiscan.io" },
  { id: "optimism", kind: "evm", native: "ETH", chainId: 10, explorer: "https://optimistic.etherscan.io" },
  { id: "polygon", kind: "evm", native: "POL", chainId: 137, explorer: "https://polygonscan.com" },
];

export function traceChain(id: string): TraceChain | null {
  return TRACE_CHAINS.find((c) => c.id === id) ?? null;
}

/** The EVM chains, for switching an 0x address between them. */
export const EVM_TRACE_CHAINS = TRACE_CHAINS.filter((c) => c.kind === "evm");

const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Whether `address` is written the way `chain` writes addresses. */
export function validWallet(chain: TraceChain, address: string): boolean {
  return chain.kind === "evm" ? isEvmAddress(address) : SOLANA.test(address);
}

/**
 * A pasted wallet (an address, or an explorer / GMGN / Solscan link) -> where to trace it. An 0x address
 * without a chain in its link goes to Ethereum; the page switches between the EVM chains.
 */
export function parseWallet(raw: string): { chain: string; address: string } | null {
  const parsed = parseInput(raw);
  if (!parsed) return null;
  const { address, chainHint } = parsed;
  if (isEvmAddress(address)) {
    const chain = chainHint && traceChain(chainHint)?.kind === "evm" ? chainHint : "ethereum";
    return { chain, address };
  }
  return SOLANA.test(address) ? { chain: "solana", address } : null;
}

export function traceHref(chain: string, address: string): string {
  return `/trace/${chain}/${encodeURIComponent(address)}`;
}

export function explorerAddress(chain: TraceChain, address: string): string {
  return `${chain.explorer}/${chain.kind === "solana" ? "account" : "address"}/${address}`;
}

export function explorerTx(chain: TraceChain, tx: string): string {
  return `${chain.explorer}/tx/${tx}`;
}
