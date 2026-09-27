import { HomeFeed, LiveStatus } from "@/components/HomeFeed";
import { PasteBox } from "@/components/PasteBox";
import { chainMeta, FEATURED_CHAINS } from "@/lib/chains";

const STEPS = [
  {
    title: "Paste a CA",
    body: "Any memecoin contract address, or a pump.fun / DexScreener / GMGN link. The chain is detected for you.",
  },
  {
    title: "Entry gets locked",
    body: "Rankr stamps the price and market cap at the exact moment of the first paste. No backdating, no edits.",
  },
  {
    title: "Watch it rank",
    body: "Every token is tracked live against its entry: 2x, 10x, 100x, or the drawdown. The board ranks them all.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative pt-14 pb-12 sm:pt-24 sm:pb-16">
        <div className="dot-grid pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2" aria-hidden />
        <div className="relative mx-auto max-w-2xl text-center">
          <LiveStatus />
          <h1 className="mt-6 font-pixel text-[2.6rem] leading-[1.05] tracking-tight sm:text-7xl">
            Paste a CA.
            <br />
            Watch it rank
            <span className="cursor-blink ml-1 inline-block h-[0.8em] w-[0.5em] translate-y-[0.08em] bg-brand align-baseline" aria-hidden />
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base text-pretty text-muted sm:text-lg">
            Rankr locks the market cap the second a token is pasted, then tracks every 2x, 10x, 100x (or the dump) from
            there.
          </p>
          <div className="mt-8" id="paste">
            <PasteBox />
          </div>
          <div className="label mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-subtle">
            {FEATURED_CHAINS.map((id) => (
              <span key={id}>{chainMeta(id).short}</span>
            ))}
            <span className="text-muted">+ every DexScreener chain</span>
          </div>
        </div>
      </section>

      <HomeFeed />

      <section className="mt-16" aria-labelledby="how">
        <h2 id="how" className="label text-muted">
          How it works
        </h2>
        <ol className="mt-3 grid overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 sm:gap-px">
          {STEPS.map(({ title, body }, i) => (
            <li key={title} className="border-b border-border bg-surface p-5 last:border-0 sm:border-0">
              <span className="font-mono text-xs text-brand-ink">0{i + 1}</span>
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
