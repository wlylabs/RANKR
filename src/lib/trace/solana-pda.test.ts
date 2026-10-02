import { describe, expect, it } from "vitest";
import { base58Decode, base58Encode, findProgramAddress, isOnCurve, metadataAddress, readMetadata } from "./solana-pda";

const enc = (s: string) => new TextEncoder().encode(s);

describe("program addresses", () => {
  it("derives Raydium's pool authorities from their seeds, as the chain does", () => {
    expect(findProgramAddress([enc("amm authority")], "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8")).toBe(
      "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
    );
    expect(findProgramAddress([enc("vault_and_lp_mint_auth_seed")], "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C")).toBe(
      "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL",
    );
  });

  it("tells a wallet (on the curve) from a program address (off it)", () => {
    expect(isOnCurve(base58Decode("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"))).toBe(true);
    expect(isOnCurve(base58Decode("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"))).toBe(false);
    expect(isOnCurve(base58Decode(metadataAddress("So11111111111111111111111111111111111111112")))).toBe(false);
  });

  it("round-trips base58, leading zeros included", () => {
    for (const a of ["11111111111111111111111111111111", "So11111111111111111111111111111111111111112"])
      expect(base58Encode(base58Decode(a))).toBe(a);
    expect(base58Decode("11111111111111111111111111111111")).toHaveLength(32);
  });
});

describe("readMetadata", () => {
  const MINT = "So11111111111111111111111111111111111111112";
  const AUTH = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
  /** A Metaplex MetadataV1 account: key, authority, mint, name, symbol, uri, fee, creators, sale, is_mutable. */
  const account = (mutable: boolean, creators = 0, mint = MINT) => {
    const str = (s: string) => {
      const b = enc(s);
      const out = new Uint8Array(4 + b.length);
      new DataView(out.buffer).setUint32(0, b.length, true);
      out.set(b, 4);
      return out;
    };
    const parts = [
      Uint8Array.of(4),
      base58Decode(AUTH),
      base58Decode(mint),
      str("Meme\0\0\0"),
      str("MEME"),
      str("https://x"),
      Uint8Array.of(0, 0),
      creators ? Uint8Array.of(1, creators, 0, 0, 0, ...new Array(34 * creators).fill(7)) : Uint8Array.of(0),
      Uint8Array.of(1),
      Uint8Array.of(mutable ? 1 : 0),
    ];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0) + 20);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };

  it("reads who can change it and whether it still can", () => {
    expect(readMetadata(account(true), MINT)).toEqual({ updateAuthority: AUTH, mutable: true });
    expect(readMetadata(account(false, 2), MINT)).toEqual({ updateAuthority: AUTH, mutable: false });
  });

  it("turns down another mint's metadata", () => {
    expect(readMetadata(account(true), AUTH)).toBeNull();
  });
});
