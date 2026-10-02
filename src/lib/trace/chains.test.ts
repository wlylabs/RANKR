import { describe, expect, it } from "vitest";
import { parseWallet, traceHref } from "./chains";
import { labelOf, parseDeposits } from "./labels";
import { firstFunding, splitSwaps, topFlows, type Leg } from "./flows";

const SOL = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const EVM = "0x28C6c06298d514Db089934071355E5743bf21d60";

describe("parseWallet", () => {
  it("takes addresses and explorer links, and sends 0x addresses to the chain in their link", () => {
    expect(parseWallet(SOL)).toEqual({ chain: "solana", address: SOL });
    expect(parseWallet(`https://solscan.io/account/${SOL}`)).toEqual({ chain: "solana", address: SOL });
    expect(parseWallet(EVM)).toEqual({ chain: "ethereum", address: EVM });
    expect(parseWallet(`https://basescan.org/address/${EVM}`)).toEqual({ chain: "base", address: EVM });
    expect(parseWallet(`https://optimistic.etherscan.io/address/${EVM}#tokentxns`)).toEqual({
      chain: "optimism",
      address: EVM,
    });
    // BSC: its tokens have reports (its wallets say they can't be traced yet).
    expect(parseWallet(`https://bscscan.com/address/${EVM}`)).toEqual({ chain: "bsc", address: EVM });
    expect(parseWallet("EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t")).toBeNull();
    expect(parseWallet("hello")).toBeNull();
    expect(traceHref("solana", SOL)).toBe(`/trace/solana/${SOL}`);
  });
});

describe("labels", () => {
  it("names exchanges' own wallets and OFAC-listed ones, EVM in any case", () => {
    expect(labelOf("solana", SOL)).toMatchObject({ kind: "cex", name: "Binance" });
    expect(labelOf("ethereum", EVM)).toMatchObject({ kind: "cex", name: "Binance" });
    expect(labelOf("ethereum", EVM.toLowerCase())).toMatchObject({ kind: "cex", name: "Binance" });
    expect(labelOf("solana", "42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi")).toMatchObject({
      kind: "sanctioned",
      source: "OFAC SDN list",
    });
    expect(labelOf("solana", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4")).toMatchObject({
      kind: "dex",
      name: "Jupiter",
    });
    expect(labelOf("solana", "3vZ67CubA5Grnn2qpfjVFXCsq3x9rv4Q8kJ7RgTd2kQD")).toBeNull();
  });

  it("reads the deposit list, skipping lowercased rows", () => {
    const csv = [
      "ADDRESS,LABEL_TYPE,LABEL_SUBTYPE,ADDRESS_NAME,PROJECT_NAME",
      "DZJEkYa9zoMYrMkwhvh3Qen5ER8Ga6voRDJDCZBR7Ykz,cex,deposit_wallet,binance deposit_wallet,binance",
      "F7nqmScTgLEGqB13dg2VQeURpk7htKvkdcxK5fXZGoqk,cex,deposit_wallet,okx deposit_wallet,okx",
      "9ftgm6hjulcpa8an4sfg5yshuexdzbtmedcxsyntnwh5,cex,deposit_wallet,robinhood deposit,robinhood",
      "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS,cex,hot_wallet,coinbase hot wallet,coinbase",
    ].join("\n");
    const deposits = parseDeposits(csv);
    expect([...deposits]).toEqual([
      ["DZJEkYa9zoMYrMkwhvh3Qen5ER8Ga6voRDJDCZBR7Ykz", "Binance"],
      ["F7nqmScTgLEGqB13dg2VQeURpk7htKvkdcxK5fXZGoqk", "OKX"],
    ]);
    expect(labelOf("solana", "F7nqmScTgLEGqB13dg2VQeURpk7htKvkdcxK5fXZGoqk", deposits)).toMatchObject({
      kind: "cex",
      name: "OKX deposit",
    });
  });
});

const leg = (over: Partial<Leg>): Leg => ({
  tx: "t",
  time: 0,
  dir: "out",
  counterparty: "X",
  asset: "native",
  symbol: "SOL",
  amount: 1,
  usd: 150,
  native: true,
  ...over,
});

describe("flows", () => {
  it("sets trades aside: one asset out, another back in the same transaction", () => {
    const { transfers, swaps } = splitSwaps([
      leg({ tx: "swap", usd: 300 }),
      leg({ tx: "swap", dir: "in", counterparty: "Pool", asset: "MEME", native: false, usd: null }),
      leg({ tx: "pay", counterparty: "Friend" }),
      leg({ tx: "relay", dir: "in", counterparty: "A" }),
      leg({ tx: "relay", counterparty: "B" }),
    ]);
    expect(transfers.map((l) => l.tx)).toEqual(["pay", "relay", "relay"]);
    expect(swaps).toEqual({ txs: 1, usd: 300 });
  });

  it("groups by counterparty, biggest first, leaving out dust and unpriced tokens", () => {
    const { flows, more } = topFlows(
      [
        leg({ counterparty: "A", usd: 100 }),
        leg({ counterparty: "A", tx: "t2", usd: 50, time: 5 }),
        leg({ counterparty: "B", usd: 500 }),
        leg({ counterparty: "Dust", amount: 0.000001, usd: 0.00015 }),
        leg({ counterparty: "Spam", asset: "FAKE", native: false, usd: null }),
        leg({ counterparty: "NoPrice", usd: null }),
        leg({ counterparty: "In", dir: "in" }),
      ],
      "out",
    );
    expect(flows.map((f) => [f.address, f.usd, f.txs])).toEqual([
      ["B", 500, 1],
      ["A", 150, 2],
      // Native coin with no price to go by still counts.
      ["NoPrice", null, 1],
    ]);
    expect(flows[1]).toMatchObject({ tx: "t2", last: 5 });
    expect(more).toBe(0);
  });

  it("finds the first native money in", () => {
    expect(
      firstFunding([
        leg({ dir: "in", counterparty: "Late", time: 9 }),
        leg({ dir: "in", counterparty: "First", time: 1 }),
        leg({ dir: "in", counterparty: "Token", time: 0, native: false }),
      ])?.address,
    ).toBe("First");
  });
});
