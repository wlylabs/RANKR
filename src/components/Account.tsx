"use client";

import clsx from "clsx";
import { ExternalLink, LoaderCircle, LogOut, UserRound, Wallet as WalletIcon, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { shortWallet } from "@/lib/wallet";
import { INSTALL_URL, ethereumWallet, isMobile, openInWalletUrl, solanaWallet } from "@/lib/wallets";
import { useAuth, type Chain } from "./AuthProvider";

const OPTIONS: { chain: Chain; title: string; wallets: string }[] = [
  { chain: "solana", title: "Solana", wallets: "Phantom, Solflare, Backpack" },
  { chain: "ethereum", title: "Ethereum", wallets: "MetaMask, Rabby, Coinbase Wallet" },
];

/** Header control: "Connect" when signed out, the wallet with a small menu when signed in. */
export function AccountButton() {
  const { available, ready, wallet } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  if (!available) return null;
  if (!ready) return <span className="h-8 w-20 animate-pulse rounded-md bg-surface-2" aria-hidden />;
  if (wallet) return <AccountMenu />;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialogRef.current?.showModal();
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <WalletIcon className="size-3.5" />
        <span className="hidden sm:inline">Connect</span>
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
        className="m-0 mt-auto w-full max-w-none rounded-t-xl border border-border bg-bg p-0 text-fg backdrop:bg-black/50 sm:m-auto sm:max-w-md sm:rounded-xl"
        aria-label="Connect a wallet"
      >
        {open && <ConnectPanel onDone={() => dialogRef.current?.close()} />}
      </dialog>
    </>
  );
}

function ConnectPanel({ onDone }: { onDone: () => void }) {
  const { connect } = useAuth();
  const [busy, setBusy] = useState<Chain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<Record<Chain, boolean>>({ solana: false, ethereum: false });
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setDetected({ solana: !!solanaWallet(), ethereum: !!ethereumWallet() });
    setMobile(isMobile());
  }, []);

  async function choose(chain: Chain) {
    setBusy(chain);
    setError(null);
    try {
      await connect(chain);
      onDone();
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      setError(/reject|denied|cancel/i.test(message) ? "Signature request was cancelled." : message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold tracking-tight">Connect a wallet</h2>
          <p className="mt-0.5 text-sm text-muted">Sync your calls across devices and join the caller board.</p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {OPTIONS.map(({ chain, title, wallets }) =>
          detected[chain] ? (
            <button
              key={chain}
              type="button"
              disabled={busy !== null}
              onClick={() => choose(chain)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{title}</div>
                <div className="truncate text-xs text-muted">{wallets}</div>
              </div>
              {busy === chain ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
                  <LoaderCircle className="size-3.5 animate-spin" /> check your wallet
                </span>
              ) : (
                <span className="font-mono text-[11px] text-up">detected</span>
              )}
            </button>
          ) : (
            <a
              key={chain}
              href={mobile ? openInWalletUrl(chain) : INSTALL_URL[chain]}
              target={mobile ? undefined : "_blank"}
              rel="noreferrer"
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-muted">{title}</div>
                <div className="truncate text-xs text-subtle">{wallets}</div>
              </div>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-subtle">
                {mobile ? `open in ${chain === "solana" ? "Phantom" : "MetaMask"}` : "install"}
                <ExternalLink className="size-3" />
              </span>
            </a>
          ),
        )}
      </div>

      {error && <p className="mt-3 text-sm text-down">{error}</p>}
      <p className="mt-4 font-mono text-[11px] leading-relaxed text-subtle">
        You sign a message to prove you own the wallet. No transaction, no fees, no access to funds.
      </p>
    </div>
  );
}

function AccountMenu() {
  const { wallet, disconnect } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!wallet) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={clsx(
          "inline-flex h-8 items-center gap-2 rounded-md border border-border px-2.5 font-mono text-xs transition-colors hover:bg-surface-2",
          open && "bg-surface-2",
        )}
      >
        <span className="size-1.5 rounded-full bg-up" />
        {shortWallet(wallet.address)}
      </button>
      {open && (
        <div className="animate-fade-in absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-bg shadow-lg">
          <div className="border-b border-border px-3 py-2.5">
            <div className="font-mono text-[11px] text-subtle uppercase">{wallet.chain}</div>
            <div className="truncate font-mono text-xs" title={wallet.address}>
              {wallet.address}
            </div>
          </div>
          <Link
            href="/me"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
          >
            <UserRound className="size-3.5" /> My calls
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void disconnect();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg"
          >
            <LogOut className="size-3.5" /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
