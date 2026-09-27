// Reading the wallet out of a Supabase Auth user (Sign in with Web3). Shared by client and server.

export type Wallet = { chain: string; address: string };

type Identity = { provider?: string; id?: string; provider_id?: string; identity_data?: Record<string, unknown> };
export type AuthUserLike = {
  id: string;
  identities?: Identity[] | null;
  user_metadata?: Record<string, unknown> | null;
};

function normalizeChain(chain: unknown): string {
  const c = String(chain ?? "").toLowerCase();
  if (c.startsWith("solana")) return "solana";
  if (c.startsWith("ethereum") || c.startsWith("eip155")) return "ethereum";
  return c || "unknown";
}

function fromSub(sub: unknown): Wallet | null {
  // Web3 identities use the id "web3:<chain>:<address>".
  const m = /^web3:([^:]+):(.+)$/.exec(String(sub ?? ""));
  return m ? { chain: normalizeChain(m[1]), address: m[2] } : null;
}

function fromData(data: Record<string, unknown> | null | undefined): Wallet | null {
  if (!data) return null;
  const claims = (data.custom_claims ?? {}) as Record<string, unknown>;
  const address = claims.address ?? data.address ?? data.wallet_address;
  if (typeof address === "string" && address) return { chain: normalizeChain(claims.chain ?? data.chain), address };
  return fromSub(data.sub);
}

/** The wallet a user signed in with, or null for non-wallet users. */
export function walletOf(user: AuthUserLike | null | undefined): Wallet | null {
  if (!user) return null;
  for (const identity of user.identities ?? []) {
    if (identity.provider && identity.provider !== "web3") continue;
    const wallet = fromData(identity.identity_data) ?? fromSub(identity.provider_id) ?? fromSub(identity.id);
    if (wallet) return wallet;
  }
  return fromData(user.user_metadata ?? null);
}

export function shortWallet(address: string): string {
  return address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}
