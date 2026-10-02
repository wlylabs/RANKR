// Builds src/lib/trace/labels.json, the address labels the trace page names wallets by: exchanges' own
// proof-of-reserves wallets, OFAC-sanctioned addresses, USDT / USDC addresses frozen by Tether and Circle,
// Tornado Cash, bridges and named exploiters. All from free, open-source datasets, pinned to a commit so a
// rebuild is reproducible and nobody upstream can slip a label in. Run after bumping a pin:
//   npm run trace:labels
//
// Not used: Dune's Spellbook (its Business Source License rules out data platforms like this page).
// Solana exchange deposit wallets (~100K) are too big to keep in the repo; src/lib/trace/labels.ts loads them
// at runtime from the same pinned commit as SOLANA_CEX below.
import { writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

/** github.com/prettydeath/wallet-attribution (MIT; each source keeps its license, see its README). */
const ATTRIBUTION =
  "https://raw.githubusercontent.com/prettydeath/wallet-attribution/cca75671842d67a7a72da1804a84b86eb42174ed/data";
/** github.com/bobslayerX/crypttrace (MIT): exchanges' self-published reserve wallets (Binance, OKX...), bridges, Tornado Cash. */
const CRYPTTRACE =
  "https://raw.githubusercontent.com/bobslayerX/crypttrace/78fca2ab3b0e0e26a869ebc3c98c1cc142fd191a/src/crypttrace/labels/known.json";
/** github.com/ImMike/crypto-wallet-address-labels (MIT). */
export const SOLANA_CEX =
  "https://raw.githubusercontent.com/ImMike/crypto-wallet-address-labels/ba96d497075fe25d98100eefba85b3e9ce7aada0/datasets/solana-wallet-and-program-labels/solana_cex_labels.csv";

/** Trace chain -> the dataset's file. */
const CHAINS = {
  solana: "solana",
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  optimism: "optimism",
  polygon: "polygon",
};

/** When an address is in several lists, the first kind here wins. */
const PRIORITY = ["sanctioned", "hack", "scam", "mixer", "frozen", "cex", "bridge"];

/** Not bridges people move money through: wrapped tokens, 0x's internal "bridges", old contracts. */
const NOT_BRIDGES = new Set(["bridged-token", "0x-protocol", "charity", "old-contract", "aura-finance"]);

/** A minimal CSV reader: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  const [head = [], ...body] = rows;
  const keys = head.map((k) => k.replace(/^﻿/, "").trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

/** One wallet-attribution row -> [kind, name], or null when it isn't one we show. */
export function classify(r) {
  const label = r.label.trim();
  if (r.category === "sanctioned" && r.confidence === "high") return ["sanctioned", "OFAC sanctioned"];
  if (r.category === "hack" && /exploit|hack|drain|attacker|heist/i.test(label)) return ["hack", label];
  if (/tornado\.?\s?cash/i.test(label)) return ["mixer", "Tornado Cash"];
  if (r.category === "frozen" && r.confidence === "high" && !/^null:/i.test(label)) {
    const tether = r.source.includes("tether");
    const circle = r.source.includes("circle");
    return [
      "frozen",
      tether && circle ? "Frozen by Tether and Circle" : circle ? "USDC frozen by Circle" : "USDT frozen by Tether",
    ];
  }
  if (r.category === "exchange" && r.confidence === "high") return ["cex", r.entity.replace(/\s*\(.*\)$/, "") || label];
  if (r.category === "bridge" && !NOT_BRIDGES.has(r.entity)) return ["bridge", label];
  return null;
}

const titleCase = (s) =>
  s
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/^Ftx/, "FTX")
    .replace(/^Okx/, "OKX");

/** A Solana address as written: base58, mixed case. Some lists hold lowercased or Bitcoin ones; those never match. */
const isSolana = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) && a !== a.toLowerCase() && !/^[13]/.test(a);

/** crypttrace's kinds -> ours. */
const CRYPTTRACE_KINDS = { exchange: "cex", bridge: "bridge", mixer: "mixer", sanctioned: "sanctioned", scam: "scam" };

/** "Binance 14 (hot wallet)", "OKX reserve wallet" -> "Binance", "OKX"; everything else as it is. */
export function exchangeName(name) {
  return name
    .replace(/\s*\(.*\)$/, "")
    .replace(/\s+(reserve|hot|cold|deposit)\b.*$/i, "")
    .replace(/\s+\d+$/, "")
    .trim();
}

async function text(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

async function build() {
  const chains = {};
  const known = JSON.parse(await text(CRYPTTRACE));
  for (const [chain, file] of Object.entries(CHAINS)) {
    const evm = chain !== "solana";
    /** address -> [kind, name] */
    const best = new Map();
    const add = (address, kind, name) => {
      if (evm ? !/^0x[0-9a-fA-F]{40}$/.test(address) : !isSolana(address)) return;
      const key = evm ? address.toLowerCase() : address;
      const cur = best.get(key);
      if (!cur || PRIORITY.indexOf(kind) < PRIORITY.indexOf(cur[0])) best.set(key, [kind, name]);
    };
    for (const r of parseCsv(await text(`${ATTRIBUTION}/${file}.csv`))) {
      const hit = classify(r);
      if (hit) add(r.address.trim(), ...hit);
    }
    for (const [address, v] of Object.entries(known)) {
      const on = v.chain === "sol" ? "solana" : !v.chain || v.chain === "eth" ? "ethereum" : null;
      const kind = CRYPTTRACE_KINDS[v.type];
      if (on === chain && kind) add(address, kind, kind === "cex" ? exchangeName(v.name) : v.name);
    }
    if (chain === "solana") {
      // The exchanges' own hot, cold and treasury wallets; their users' deposit wallets load at runtime.
      for (const r of parseCsv(await text(SOLANA_CEX))) {
        if (r.LABEL_TYPE === "cex" && r.LABEL_SUBTYPE !== "deposit_wallet")
          add(r.ADDRESS.trim(), "cex", titleCase(r.PROJECT_NAME));
      }
    }
    // Grouped by kind and name, so a name is written once: { cex: { Binance: [addresses] } }.
    const grouped = {};
    for (const [address, [kind, name]] of [...best].sort(([a], [b]) => a.localeCompare(b))) {
      ((grouped[kind] ??= {})[name] ??= []).push(address);
    }
    chains[chain] = grouped;
    console.log(chain, best.size);
  }
  return { generatedBy: "scripts/build-trace-labels.mjs", chains };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const out = await build();
  writeFileSync(path.join(root, "src", "lib", "trace", "labels.json"), JSON.stringify(out));
  console.log("wrote src/lib/trace/labels.json");
}
