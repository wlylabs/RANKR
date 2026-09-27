import type { Metadata } from "next";
import Link from "next/link";
import { DecryptText } from "@/components/DecryptText";
import { LiveStatus } from "@/components/HomeFeed";
import { Faq } from "@/components/Landing";
import { APP_HOME } from "@/lib/login";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// One idea per block, a few words each: the page should read in seconds.
const STEPS = [
  { title: "Paste", body: "Any contract address or link." },
  { title: "Seal", body: "Entry locked. No backdating." },
  { title: "Rank", body: "Every 2x, 10x, 100x, live." },
];

const FAQ = [
  {
    q: "What is a call?",
    a: "The market cap at the second a token is pasted, taken from live market data.",
  },
  {
    q: "Can an entry be changed?",
    a: "No. Every entry is sealed with SHA-256 and the database rejects any edit.",
  },
  {
    q: "Do I need a wallet?",
    a: "No wallet and no email. Continue as a guest in one click.",
  },
  {
    q: "Is there an app?",
    a: "Yes. Open Settings, the gear at the top, and choose Install app.",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <section className="flex flex-col items-center justify-center py-20 text-center sm:min-h-[calc(72svh-3.5rem)] sm:py-16">
        <LiveStatus />
        <h1 className="mt-7 font-mono text-[2.4rem] leading-[1.08] font-medium tracking-[-0.06em] sm:text-7xl">
          <DecryptText text="Paste a CA." className="block" />
          <DecryptText text="Watch it rank." className="block text-muted" duration={1200} />
        </h1>
        <p className="mt-6 max-w-sm text-[15px] text-pretty text-muted sm:max-w-md sm:text-base">
          Every call is sealed the second it&apos;s pasted, then ranked live.
        </p>
        {/* The one next step, styled like the app's own primary buttons (Track, Paste a CA). */}
        <Link
          href={APP_HOME}
          className="mt-8 inline-flex h-10 items-center rounded-md bg-fg px-5 text-sm font-medium text-bg transition-opacity hover:opacity-85"
        >
          Start tracking
        </Link>
        <p className="mt-6 font-mono text-[11px] text-subtle">free · no wallet · no email</p>
      </section>

      <section aria-label="How Rankr works" className="border-y border-border">
        <ol className="grid divide-border max-sm:divide-y sm:grid-cols-3 sm:divide-x">
          {STEPS.map(({ title, body }, i) => (
            <li key={title} className="flex items-baseline gap-4 py-6 sm:flex-col sm:items-center sm:gap-2 sm:py-10 sm:text-center">
              <span className="tabular font-mono text-xs text-subtle">0{i + 1}</span>
              <div>
                <h2 className="font-medium">{title}</h2>
                <p className="mt-1 text-sm text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="faq" className="mt-24">
        <h2 id="faq" className="label text-center text-subtle">
          FAQ
        </h2>
        <div className="mt-6">
          <Faq items={FAQ} />
        </div>
      </section>
    </div>
  );
}
