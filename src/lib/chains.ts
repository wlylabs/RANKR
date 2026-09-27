type ChainMeta = { name: string; short: string; color: string };

const CHAINS: Record<string, ChainMeta> = {
  solana: { name: "Solana", short: "SOL", color: "#9945FF" },
  ethereum: { name: "Ethereum", short: "ETH", color: "#627EEA" },
  base: { name: "Base", short: "BASE", color: "#0052FF" },
  bsc: { name: "BNB Chain", short: "BSC", color: "#F0B90B" },
  arbitrum: { name: "Arbitrum", short: "ARB", color: "#28A0F0" },
  polygon: { name: "Polygon", short: "POL", color: "#8247E5" },
  avalanche: { name: "Avalanche", short: "AVAX", color: "#E84142" },
  sui: { name: "Sui", short: "SUI", color: "#4DA2FF" },
  ton: { name: "TON", short: "TON", color: "#0098EA" },
  tron: { name: "Tron", short: "TRX", color: "#FF060A" },
  blast: { name: "Blast", short: "BLAST", color: "#FCFC03" },
  optimism: { name: "Optimism", short: "OP", color: "#FF0420" },
  sonic: { name: "Sonic", short: "S", color: "#FE9A4C" },
  abstract: { name: "Abstract", short: "ABS", color: "#00C16E" },
  hyperevm: { name: "HyperEVM", short: "HYPE", color: "#50E3C2" },
};

/** Chains shown on the landing page. Everything DexScreener lists is accepted. */
export const FEATURED_CHAINS = ["solana", "ethereum", "base", "bsc", "arbitrum", "sui", "ton", "tron"];

export function chainMeta(chainId: string): ChainMeta {
  return (
    CHAINS[chainId] ?? {
      name: chainId.charAt(0).toUpperCase() + chainId.slice(1),
      short: chainId.slice(0, 4).toUpperCase(),
      color: "#7A8691",
    }
  );
}

export function chainIconUrl(chainId: string): string {
  return `https://dd.dexscreener.com/ds-data/chains/${chainId}.png`;
}
