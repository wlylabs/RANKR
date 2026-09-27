import { describe, expect, it } from "vitest";
import { shortWallet, walletOf } from "./wallet";

describe("walletOf", () => {
  it("reads custom claims on the web3 identity", () => {
    const user = {
      id: "u",
      identities: [
        {
          provider: "web3",
          identity_data: { sub: "web3:solana:7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", custom_claims: { address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", chain: "solana:mainnet" } },
        },
      ],
    };
    expect(walletOf(user)).toEqual({ chain: "solana", address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr" });
  });

  it("falls back to the web3:<chain>:<address> id", () => {
    expect(walletOf({ id: "u", identities: [{ provider: "web3", provider_id: "web3:ethereum:0xabc" }] })).toEqual({
      chain: "ethereum",
      address: "0xabc",
    });
    expect(walletOf({ id: "u", user_metadata: { sub: "web3:solana:Abc123" } })).toEqual({ chain: "solana", address: "Abc123" });
  });

  it("ignores non-wallet users", () => {
    expect(walletOf({ id: "u", identities: [{ provider: "email", identity_data: { email: "a@b.c" } }] })).toBeNull();
    expect(walletOf(null)).toBeNull();
  });

  it("shortens addresses", () => {
    expect(shortWallet("7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr")).toBe("7GCi…W2hr");
  });
});
