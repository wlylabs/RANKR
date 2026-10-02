// Names for addresses, so a trail reads "→ Binance" instead of "→ 5tzF…uAi9". Three layers:
// - labels.json: exchanges' own reserve wallets, OFAC-sanctioned addresses, USDT / USDC frozen by Tether and
//   Circle, Tornado Cash, bridges and named exploiters, from open-source datasets (scripts/build-trace-labels.mjs);
// - the Solana programs a trade or a bridge goes through (below), to tell a swap from a payment;
// - Solana exchange deposit wallets (~100K), too many to keep in the repo, read once per server from the
//   same pinned dataset the build script uses, and skipped if that fails.
import data from "./labels.json";
import type { TraceLabel, TraceLabelKind } from "./types";

const SOURCES: Partial<Record<TraceLabelKind, string>> = {
  cex: "exchange reserve lists",
  sanctioned: "OFAC SDN list",
  frozen: "Tether / Circle blacklists",
};

type Grouped = Partial<Record<TraceLabelKind, Record<string, string[]>>>;

let index: Map<string, TraceLabel> | null = null;

/** chain:address -> label, built on first use. EVM addresses lowercased. */
function labelIndex(): Map<string, TraceLabel> {
  if (index) return index;
  index = new Map();
  for (const [chain, kinds] of Object.entries(data.chains as Record<string, Grouped>)) {
    for (const [kind, names] of Object.entries(kinds) as [TraceLabelKind, Record<string, string[]>][]) {
      const source = SOURCES[kind] ?? "open-source label lists";
      for (const [name, addresses] of Object.entries(names)) {
        for (const address of addresses) index.set(`${chain}:${address}`, { kind, name, source });
      }
    }
  }
  return index;
}

const key = (chain: string, address: string) =>
  `${chain}:${address.startsWith("0x") ? address.toLowerCase() : address}`;

// ---- Solana programs. Ids from the programs' own docs and public program lists (verified, not guessed).

const SOLANA_DEX: Record<string, string> = {
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter",
  JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: "Jupiter",
  JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph: "Jupiter",
  JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo: "Jupiter",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium",
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "Raydium",
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: "Raydium",
  LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj: "Raydium LaunchLab",
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "Orca",
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: "Meteora",
  Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB: "Meteora",
  cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG: "Meteora",
  dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN: "Meteora",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "pump.fun",
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: "PumpSwap",
  PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY: "Phoenix",
  srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX: "OpenBook",
  "2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c": "Lifinity",
};

const SOLANA_BRIDGES: Record<string, string> = {
  wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb: "Wormhole",
  worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth: "Wormhole",
  src5qyZHqTqecJV4aY6Cb6zDZLMDzrDKKezs22MPHr4: "deBridge",
  DEbrdGj3HsRsAzx6uH4MKyREKxVAfBydijLUF3ygsFfh: "deBridge",
  "8LPjGDbxhW4G2Q8S6FvdvUdfGWssgtqmvsc63bwNFA7E": "Mayan",
  BBbD1WSjbHKfyE3TSFWF6vx1JV51c8msKSQy4ess6pXp: "Allbridge",
};

/** The DEX a Solana transaction trades on, if it calls one. */
export function solanaDex(programs: Iterable<string>): string | null {
  for (const p of programs) if (SOLANA_DEX[p]) return SOLANA_DEX[p];
  return null;
}

/** The bridge a Solana transaction goes through, as [program, name], if it calls one. */
export function solanaBridge(programs: Iterable<string>): [string, string] | null {
  for (const p of programs) if (SOLANA_BRIDGES[p]) return [p, SOLANA_BRIDGES[p]];
  return null;
}

// ---- Solana exchange deposit wallets.

/** github.com/ImMike/crypto-wallet-address-labels (MIT), the commit scripts/build-trace-labels.mjs pins. */
const SOLANA_DEPOSITS =
  "https://raw.githubusercontent.com/ImMike/crypto-wallet-address-labels/ba96d497075fe25d98100eefba85b3e9ce7aada0/datasets/solana-wallet-and-program-labels/solana_cex_labels.csv";

const EXCHANGE_NAMES: Record<string, string> = {
  okx: "OKX",
  ftx: "FTX",
  "ftx.us": "FTX US",
  mexc: "MEXC",
  "gate.io": "Gate.io",
};
const exchangeName = (raw: string) =>
  EXCHANGE_NAMES[raw] ?? raw.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ Global$/, "");

/** "address,cex,deposit_wallet,binance deposit_wallet,binance" lines -> address -> exchange. */
export function parseDeposits(csv: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of csv.split(/\r?\n/)) {
    const [address, type, subtype, , project] = line.split(",");
    if (type !== "cex" || subtype !== "deposit_wallet" || !project) continue;
    // Some rows are lowercased, which no real (case-sensitive) Solana address matches.
    if (address === address.toLowerCase()) continue;
    out.set(address, exchangeName(project.trim()));
  }
  return out;
}

let deposits: Promise<Map<string, string>> | null = null;
let depositsFailedAt = 0;

/** The deposit list, read once per server (6 MB). Empty, and tried again in 10 minutes, if it can't be read. */
export function solanaDeposits(): Promise<Map<string, string>> {
  if (deposits && !(depositsFailedAt && Date.now() - depositsFailedAt > 600_000)) return deposits;
  depositsFailedAt = 0;
  deposits = fetch(SOLANA_DEPOSITS, { cache: "no-store", signal: AbortSignal.timeout(20_000) })
    .then(async (res) => {
      if (!res.ok) throw new Error(`status ${res.status}`);
      return parseDeposits(await res.text());
    })
    .catch((err) => {
      console.warn("[rankr] trace: exchange deposit list unavailable:", (err as Error).message);
      depositsFailedAt = Date.now();
      return new Map<string, string>();
    });
  return deposits;
}

/** Everything known about an address on `chain` (deposits: the Solana deposit list, when loaded). */
export function labelOf(chain: string, address: string, deposits?: Map<string, string>): TraceLabel | null {
  const known = labelIndex().get(key(chain, address));
  if (known) return known;
  if (chain === "solana") {
    if (SOLANA_DEX[address]) return { kind: "dex", name: SOLANA_DEX[address], source: "program list" };
    if (SOLANA_BRIDGES[address]) return { kind: "bridge", name: SOLANA_BRIDGES[address], source: "program list" };
    const exchange = deposits?.get(address);
    if (exchange) return { kind: "cex", name: `${exchange} deposit`, source: "exchange deposit list" };
  }
  return null;
}
