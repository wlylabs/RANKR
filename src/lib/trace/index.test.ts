import { describe, expect, it, vi } from "vitest";
import { withKeys, type Caller } from "./keys";

const state = vi.hoisted(() => ({ reads: 0, stored: new Map<string, unknown>() }));
vi.mock("./solana", () => ({
  traceSolana: async (address: string) => {
    state.reads++;
    return { address, scanned: { limited: false }, updatedAt: 1 };
  },
}));
vi.mock("./stored", () => ({
  readStored: async (key: string) => state.stored.get(key) ?? null,
  store: (key: string, value: unknown) => void state.stored.set(key, value),
}));

const { traceWallet } = await import("./index");
const W = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const W2 = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const caller = (id: string, left: number): Caller => ({
  userId: id,
  blockscout: null,
  helius: null,
  allowance: async () => left-- > 0,
});

describe("traceWallet, shared", () => {
  it("serves a wallet anyone has read to everyone, free, and keeps it for every server", async () => {
    const a = caller("a", 1);
    await withKeys(a, () => traceWallet("solana", W));
    expect(state.reads).toBe(1);
    expect(state.stored.has(`solana:${W}`)).toBe(true);
    // b has no allowance left: the wallet comes from the shared read anyway.
    expect(await withKeys(caller("b", 0), () => traceWallet("solana", W))).toMatchObject({ address: W });
    expect(state.reads).toBe(1);
  });

  it("takes a wallet nobody has read from the allowance, and says when it's spent", async () => {
    await expect(withKeys(caller("c", 0), () => traceWallet("solana", W2))).rejects.toMatchObject({ code: "allowance" });
    expect(state.reads).toBe(1);
    // From the stored reads (another server's), still free.
    state.stored.set(`solana:${W2}`, { address: W2, scanned: { limited: false }, updatedAt: 2 });
    expect(await withKeys(caller("c", 0), () => traceWallet("solana", W2))).toMatchObject({ address: W2 });
  });
});
