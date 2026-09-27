import { Lock } from "lucide-react";
import { DecryptText } from "@/components/DecryptText";
import { HomeFeed, LiveStatus } from "@/components/HomeFeed";
import { PasteBox } from "@/components/PasteBox";
import { chainMeta, FEATURED_CHAINS } from "@/lib/chains";

export default function HomePage() {
  return (
    <>
      <section className="pt-16 pb-14 sm:pt-28 sm:pb-20">
        <div className="mx-auto max-w-2xl text-center">
          <LiveStatus />
          <h1 className="mt-6 font-mono text-[2.1rem] leading-[1.1] font-medium tracking-[-0.06em] sm:text-6xl">
            <DecryptText text="Paste a CA." className="block" />
            <DecryptText text="Watch it rank." className="block text-muted" duration={1200} />
          </h1>
          <p className="mx-auto mt-5 max-w-md text-[15px] text-pretty text-muted sm:text-base">
            Rankr seals the market cap the moment a token is pasted, then tracks every 2x, 10x, 100x (or the dump) from
            there.
          </p>
          <div className="mt-8" id="paste">
            <PasteBox resumeFromUrl />
          </div>
          <p className="mt-4 flex flex-col items-center justify-center gap-1 font-mono text-[11px] text-subtle sm:flex-row sm:gap-3">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3" />
              sha256-sealed entries
            </span>
            <span className="hidden sm:inline">·</span>
            <span>{FEATURED_CHAINS.map((id) => chainMeta(id).short).join(" ")} + more</span>
          </p>
        </div>
      </section>

      <HomeFeed />
    </>
  );
}
