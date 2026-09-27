import { ChartNoAxesCombined, ClipboardPaste, Lock } from "lucide-react";
import { HomeFeed } from "@/components/HomeFeed";
import { PasteBox } from "@/components/PasteBox";
import { chainMeta, FEATURED_CHAINS } from "@/lib/chains";

const STEPS = [
  {
    icon: ClipboardPaste,
    title: "Paste a CA",
    body: "Drop any memecoin contract address, or a pump.fun / DexScreener / GMGN link. Chain is detected automatically.",
  },
  {
    icon: Lock,
    title: "Entry gets locked",
    body: "Rankr records the price and market cap at the exact moment of the first paste. No backdating.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Watch it rank",
    body: "Every token is tracked live: 2x, 5x, 10x, 100x, or the drawdown. The board ranks them all.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative pt-12 pb-10 sm:pt-20 sm:pb-14">
        {/* Full-bleed backdrop that escapes the page container */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2" aria-hidden>
          <div className="hero-glow absolute inset-0" />
          <div className="grid-lines absolute inset-0 opacity-60" />
        </div>
        <div className="relative mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-up" />
            </span>
            Live memecoin call tracker
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-[-0.04em] text-balance sm:text-6xl">
            Paste a CA.
            <br />
            <span className="bg-gradient-to-r from-[#b8e619] to-[#19d98c] bg-clip-text text-transparent dark:from-[#e4ff3f] dark:to-[#19d98c]">
              Watch it rank.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-pretty text-muted sm:text-lg">
            Rankr locks the market cap the moment a token is pasted, then tracks every 2x, 5x, 10x (or the dump) from
            there.
          </p>
          <div className="mt-8" id="paste">
            <PasteBox />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-subtle">
            {FEATURED_CHAINS.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ background: chainMeta(id).color }} />
                {chainMeta(id).name}
              </span>
            ))}
            <span>+ every chain on DexScreener</span>
          </div>
        </div>
      </section>

      <HomeFeed />

      <section className="mt-14" aria-labelledby="how">
        <h2 id="how" className="text-lg font-bold tracking-tight">
          How it works
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-fg">
                  <Icon className="size-[18px]" />
                </span>
                <span className="text-xs font-semibold text-subtle">STEP {i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
