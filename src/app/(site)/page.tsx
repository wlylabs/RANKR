import { Globe, KeyRound, Lock, Plus, TrendingUp, Trophy, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DecryptText } from "@/components/DecryptText";
import { LiveStatus, StatsGrid } from "@/components/HomeFeed";
import { LiveCall } from "@/components/Landing";
import { chainMeta, FEATURED_CHAINS } from "@/lib/chains";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const STEPS = [
  {
    title: "Paste a CA",
    body: "Any memecoin contract address, or a pump.fun / DexScreener / GMGN / Birdeye / explorer link. The chain is detected for you, and the most liquid pair is picked.",
    visual: (
      <>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface p-1.5">
          <span className="min-w-0 flex-1 truncate px-2 font-mono text-xs text-muted">9aQf…pump</span>
          <span className="rounded bg-fg px-2.5 py-1 text-xs font-medium text-bg">Track</span>
        </div>
        <p className="mt-2 font-mono text-[10px] text-subtle">pasting a valid CA tracks it, no extra click</p>
      </>
    ),
  },
  {
    title: "The entry gets sealed",
    body: "Price and market cap are locked at the first paste and fingerprinted with SHA-256. The database rejects any edit, so no call can be backdated.",
    visual: (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
        <dt className="text-subtle">entry</dt>
        <dd className="truncate text-muted">price + mc at the paste</dd>
        <dt className="text-subtle">seal</dt>
        <dd className="truncate text-muted">sha256(chain:address:price:time)</dd>
        <dt className="text-subtle">edits</dt>
        <dd className="truncate text-down">rejected</dd>
      </dl>
    ),
  },
  {
    title: "Watch it rank",
    body: "Every token is tracked live against its entry: 2x, 10x, 100x, or the drawdown. Tokens and callers are ranked on public leaderboards.",
    visual: (
      <>
        <p className="font-mono text-[11px] text-muted">x = price now / entry price</p>
        <ol className="mt-2 grid grid-cols-4 gap-px overflow-hidden rounded-md border border-border bg-border font-mono text-xs">
          {[2, 5, 10, 100].map((x, i) => (
            <li key={x} className={i < 2 ? "bg-bg py-1.5 text-center text-up" : "bg-bg py-1.5 text-center text-subtle"}>
              {x}x
            </li>
          ))}
        </ol>
      </>
    ),
  },
];

const FEATURES = [
  {
    icon: Lock,
    title: "Sealed entries",
    body: "Every token carries sha256(chain:address:entryPrice:firstPastedAt). Anyone can recompute it, so an edited entry would no longer match.",
  },
  {
    icon: TrendingUp,
    title: "The live multiple",
    body: "Current price over entry price: 3.42x for gains, -37% for losses. The peak and the low since the paste are kept too.",
  },
  {
    icon: Trophy,
    title: "Leaderboards",
    body: "Top gainers, peak x, biggest dumps, newest and most pasted. Filter by 24h, 7d or 30d, by chain, or search by name.",
  },
  {
    icon: UsersRound,
    title: "A name behind every call",
    body: "Callers are ranked by 2x hits, average x and best call. My calls measures every token from your own paste.",
  },
  {
    icon: KeyRound,
    title: "No wallet, no email",
    body: "Continue as a guest in one click. Save a key like rk-7F3A-K9QX-… to sign in on any other device. Nothing to connect.",
  },
  {
    icon: Globe,
    title: "Every chain DexScreener lists",
    body: "Solana, Ethereum, Base, BSC, Arbitrum, Sui, TON, Tron and more. Pair migrations, like pump.fun to PumpSwap, are followed.",
  },
];

const FAQ = [
  {
    q: "What counts as a call?",
    a: "The price and market cap of the most liquid DEX pair at the moment a token is pasted, taken from the server's market data, not from the person pasting. The first paste sets the token's entry on the board; your own paste sets your entry in My calls.",
  },
  {
    q: "Can an entry be changed or backdated?",
    a: "No. The app never rewrites it and the database rejects any change to a token's entry. Calls can be deleted, never edited. Each entry has a SHA-256 seal anyone can recompute.",
  },
  {
    q: "How is the x worked out?",
    a: "x = price now / entry price. 2x means the price doubled; losses show as a percentage (-37%). Peak and low are sampled on every refresh, so a wick between two refreshes can be missed.",
  },
  {
    q: "Do I need a wallet or an email?",
    a: "No. Browsing needs nothing. Pasting needs an account: continue as a guest in one click, then save a sign-in key to use it on other devices. Rankr never stores the key, so a lost key can't be recovered.",
  },
  {
    q: "Is there an app?",
    a: "Rankr is a web app you can install (a PWA): open Settings, the gear at the top, and choose Install app. On iPhone and iPad it's Share, then Add to Home Screen in Safari. It opens full screen on the paste box and updates on its own.",
  },
  {
    q: "Is this financial advice?",
    a: "No. Rankr measures calls, it doesn't make them. Memecoins can and do go to zero.",
  },
];

function SectionHead({ id, label, title, intro }: { id: string; label: string; title: string; intro?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="label text-subtle">
        {label}
      </h2>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</p>
      {intro && <p className="mt-3 text-[15px] text-pretty text-muted">{intro}</p>}
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div className="mx-auto max-w-2xl text-center">
          <LiveStatus />
          <h1 className="mt-6 font-mono text-[2.1rem] leading-[1.1] font-medium tracking-[-0.06em] sm:text-6xl">
            <DecryptText text="Paste a CA." className="block" />
            <DecryptText text="Watch it rank." className="block text-muted" duration={1200} />
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-[15px] text-pretty text-muted sm:text-base">
            Rankr is a memecoin call tracker. It seals the market cap the moment a token is pasted, then tracks every
            2x, 10x, 100x (or the dump) from there, on a public board.
          </p>
          <p className="mt-6 flex flex-col items-center justify-center gap-1 font-mono text-[11px] text-subtle sm:flex-row sm:gap-3">
            <span>free · no wallet · no email</span>
            <span className="hidden sm:inline">·</span>
            <span>{FEATURED_CHAINS.map((id) => chainMeta(id).short).join(" ")} + more</span>
          </p>
        </div>
        <div className="mx-auto mt-14 max-w-2xl">
          <LiveCall />
        </div>
      </section>

      {/* Live numbers */}
      <section aria-labelledby="board" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <h2 id="board" className="label text-subtle">
            The board, live
          </h2>
          <Link href="/leaderboard" className="text-xs text-muted hover:text-fg">
            Leaderboard
          </Link>
        </div>
        <StatsGrid />
      </section>

      {/* How it works */}
      <section aria-labelledby="how" className="mt-24">
        <SectionHead id="how" label="How it works" title="Three steps, and the record keeps itself." />
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ title, body, visual }, i) => (
            <li key={title} className="flex flex-col rounded-lg border border-border p-5">
              <span className="font-mono text-xs text-subtle">0{i + 1}</span>
              <h3 className="mt-2 font-medium">{title}</h3>
              <p className="mt-1 flex-1 text-sm text-muted">{body}</p>
              <div className="mt-5 border-t border-border pt-4">{visual}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section aria-labelledby="features" className="mt-24">
        <SectionHead
          id="features"
          label="Features"
          title="Built so a call can't be faked."
          intro="The price comes from the market, the time from the server, and the seal from SHA-256. Rankr just keeps score."
        />
        <ul className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="bg-bg p-5 sm:p-6">
              <Icon className="size-4 text-fg" strokeWidth={1.8} />
              <h3 className="mt-4 font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq" className="mt-24">
        <SectionHead id="faq" label="FAQ" title="Questions, answered." />
        <div className="mt-8 border-b border-border">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group border-t border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <Plus className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-45" />
              </summary>
              <p className="max-w-2xl pb-5 text-sm text-pretty text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
