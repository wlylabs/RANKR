"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { refreshBoards } from "@/lib/hooks";
import { accountsAvailable, browserSupabase } from "@/lib/supabase-browser";
import { walletOf, type AuthUserLike, type Wallet } from "@/lib/wallet";
import { ethereumWallet, solanaWallet } from "@/lib/wallets";

// Shown by the wallet when signing. One line, no newlines (wallets reject them).
const STATEMENT = "Sign in to Rankr. This only proves you own this wallet: no transaction, no fees.";

export type Chain = "solana" | "ethereum";

type AuthState = {
  /** Wallet sign-in is configured for this deployment. */
  available: boolean;
  /** The stored session has been read. */
  ready: boolean;
  userId: string | null;
  wallet: Wallet | null;
  connect: (chain: Chain) => Promise<void>;
  disconnect: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  available: false,
  ready: true,
  userId: null,
  wallet: null,
  connect: async () => {},
  disconnect: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!accountsAvailable);

  useEffect(() => {
    const sb = browserSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void refreshBoards();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const connect = useCallback(async (chain: Chain) => {
    const sb = browserSupabase();
    if (!sb) throw new Error("Wallet sign-in is not enabled here.");
    if (chain === "solana") {
      const wallet = solanaWallet();
      if (!wallet) throw new Error("No Solana wallet found. Install Phantom, Solflare or Backpack.");
      // Wallets without Sign In With Solana need to be connected to expose their public key.
      if (typeof wallet.signIn !== "function" && !wallet.publicKey && wallet.connect) await wallet.connect();
      const { error } = await sb.auth.signInWithWeb3({ chain, statement: STATEMENT, wallet });
      if (error) throw error;
    } else {
      const wallet = ethereumWallet();
      if (!wallet) throw new Error("No Ethereum wallet found. Install MetaMask or another browser wallet.");
      const { error } = await sb.auth.signInWithWeb3({ chain, statement: STATEMENT, wallet });
      if (error) throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    await browserSupabase()?.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      available: accountsAvailable,
      ready,
      userId: session?.user.id ?? null,
      wallet: walletOf(session?.user as AuthUserLike | undefined),
      connect,
      disconnect,
    }),
    [ready, session, connect, disconnect],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
