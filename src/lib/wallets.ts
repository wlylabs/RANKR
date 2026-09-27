"use client";

import type { EthereumWallet, SolanaWallet } from "@supabase/supabase-js";

type ConnectableSolana = SolanaWallet & { connect?: () => Promise<unknown>; isPhantom?: boolean };

type WindowWithWallets = Window & {
  phantom?: { solana?: ConnectableSolana };
  solflare?: ConnectableSolana;
  backpack?: ConnectableSolana;
  solana?: ConnectableSolana;
  ethereum?: EthereumWallet;
};

function usable(w: ConnectableSolana | undefined): w is ConnectableSolana {
  return !!w && (typeof w.signIn === "function" || typeof w.signMessage === "function");
}

/** The injected Solana wallet (Phantom, Solflare, Backpack or any window.solana), if any. */
export function solanaWallet(): ConnectableSolana | null {
  if (typeof window === "undefined") return null;
  const w = window as WindowWithWallets;
  return [w.phantom?.solana, w.solflare, w.backpack, w.solana].find(usable) ?? null;
}

/** The injected EIP-1193 wallet (MetaMask, Rabby, Coinbase Wallet...), if any. */
export function ethereumWallet(): EthereumWallet | null {
  if (typeof window === "undefined") return null;
  const eth = (window as WindowWithWallets).ethereum;
  return eth && typeof eth.request === "function" ? eth : null;
}

export function isMobile(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Opens this page inside the wallet's in-app browser (mobile has no extensions). */
export function openInWalletUrl(chain: "solana" | "ethereum"): string {
  const here = typeof window === "undefined" ? "" : window.location.href;
  return chain === "solana"
    ? `https://phantom.app/ul/browse/${encodeURIComponent(here)}?ref=${encodeURIComponent(new URL(here).origin)}`
    : `https://metamask.app.link/dapp/${here.replace(/^https?:\/\//, "")}`;
}

export const INSTALL_URL = { solana: "https://phantom.com/download", ethereum: "https://metamask.io/download/" } as const;
