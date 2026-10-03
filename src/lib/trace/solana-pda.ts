// Solana addresses from bytes and back (base58), and program-derived addresses: where a program keeps an account
// for something, like a token's Metaplex metadata. Server only (node:crypto).
import { createHash } from "node:crypto";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(text: string): Uint8Array {
  let n = 0n;
  for (const c of text) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error("not base58");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of text) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

// ---- ed25519: a program-derived address is one with no private key, so not a point on the curve.

const P = 2n ** 255n - 19n;
const mod = (a: bigint) => ((a % P) + P) % P;
function pow(base: bigint, exp: bigint): bigint {
  let r = 1n;
  let b = mod(base);
  for (let e = exp; e > 0n; e >>= 1n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
  }
  return r;
}
const D = mod(-121665n * pow(121666n, P - 2n));

/** Whether 32 bytes decompress to an ed25519 point (as Solana checks it): x² = (y² − 1) / (d·y² + 1) has a root. */
export function isOnCurve(bytes: Uint8Array): boolean {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? bytes[i] & 0x7f : bytes[i]);
  y = mod(y);
  const y2 = (y * y) % P;
  const x2 = mod((y2 - 1n) * pow(mod(D * y2 + 1n), P - 2n));
  return x2 === 0n || pow(x2, (P - 1n) / 2n) === 1n;
}

/** The address `program` derives from `seeds` (findProgramAddress): the first bump, from 255 down, off the curve. */
export function findProgramAddress(seeds: Uint8Array[], program: string): string {
  const programId = base58Decode(program);
  const marker = new TextEncoder().encode("ProgramDerivedAddress");
  for (let bump = 255; bump >= 0; bump--) {
    const hash = createHash("sha256");
    for (const s of seeds) hash.update(s);
    hash.update(Uint8Array.of(bump));
    hash.update(programId);
    hash.update(marker);
    const candidate = new Uint8Array(hash.digest());
    if (!isOnCurve(candidate)) return base58Encode(candidate);
  }
  throw new Error("no program address");
}

/** Metaplex's Token Metadata program, which keeps an SPL token's name, logo and who may change them. */
export const METADATA_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

/** Where Metaplex keeps a mint's metadata. */
export function metadataAddress(mint: string): string {
  return findProgramAddress(
    [new TextEncoder().encode("metadata"), base58Decode(METADATA_PROGRAM), base58Decode(mint)],
    METADATA_PROGRAM,
  );
}

/**
 * A Metaplex metadata account's update authority and whether it can still be changed: key, update authority,
 * mint, name, symbol, uri, seller fee, creators, primary sale, is_mutable. Null when it isn't one, or not this
 * mint's.
 */
export function readMetadata(data: Uint8Array, mint: string): { updateAuthority: string; mutable: boolean } | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (data[0] !== 4) return null; // MetadataV1
    const updateAuthority = base58Encode(data.slice(1, 33));
    if (base58Encode(data.slice(33, 65)) !== mint) return null;
    let at = 65;
    for (let i = 0; i < 3; i++) at += 4 + view.getUint32(at, true); // name, symbol, uri
    at += 2; // seller fee basis points
    if (data[at++] === 1) at += 4 + view.getUint32(at, true) * 34; // creators: address, verified, share
    at += 1; // primary sale happened
    if (at >= data.length) return null;
    return { updateAuthority, mutable: data[at] === 1 };
  } catch {
    return null;
  }
}
