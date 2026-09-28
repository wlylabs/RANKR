import type { Metadata } from "next";
import Link from "next/link";
import { HashField, Reveal } from "@/components/Cinema";
import { DecryptText } from "@/components/DecryptText";
import { LiveStatus } from "@/components/HomeFeed";
import { BoardPreview, Faq } from "@/components/Landing";
import { APP_HOME } from "@/lib/login";
import { delay } from "@/lib/motion";

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
    q: "Does the board reset?",
    a: "Yes. At 00:00 UTC on the 1st of every month every token and call is cleared and everyone starts from zero. The month's top 10 callers and tokens are kept.",
  },
  {
    q: "Is there an app?",
    a: "Yes. Open Settings, the gear at the top, and choose Install app.",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* The opening shot: the hash field comes up, then each line arrives out of a blur, in sequence
          (CSS only, so it plays on first paint without waiting for JavaScript). */}
      <section className="relative isolate">
        <HashField />
        <div className="hero-exit flex flex-col items-center justify-center py-20 text-center sm:min-h-[calc(72svh-3.5rem)] sm:py-16">
          <div className="cine-in" style={delay(0)}>
            <LiveStatus />
          </div>
          <h1 className="mt-7 font-mono text-[2.4rem] leading-[1.08] font-medium tracking-[-0.06em] sm:text-7xl">
            <span className="cine-in block" style={delay(150)}>
              <DecryptText text="Paste a CA." className="block" />
            </span>
            <span className="cine-in block" style={delay(300)}>
              <DecryptText text="Watch it rank." className="block text-muted" duration={1200} />
            </span>
          </h1>
          <p className="cine-in mt-6 max-w-sm text-[15px] text-pretty text-muted sm:max-w-md sm:text-base" style={delay(500)}>
            Every call is sealed the second it&apos;s pasted, then ranked live.
          </p>
          {/* The one next step, styled like the app's own primary buttons (Track, Paste a CA). */}
          <Link
            href={APP_HOME}
            style={delay(650)}
            className="cine-in mt-8 inline-flex h-10 items-center rounded-md bg-fg px-5 text-sm font-medium text-bg transition-opacity hover:opacity-85"
          >
            Start tracking
          </Link>
          <p className="cine-in mt-6 font-mono text-[11px] text-subtle" style={delay(800)}>
            free · no wallet · no email
          </p>
        </div>
      </section>

      <BoardPreview />

      <section aria-label="How Rankr works" className="border-y border-border">
        <ol className="grid divide-border max-sm:divide-y sm:grid-cols-3 sm:divide-x">
          {STEPS.map(({ title, body }, i) => (
            <li key={title} className="py-6 sm:py-10">
              <Reveal delay={i * 140} className="flex items-baseline gap-4 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
                <span className="tabular font-mono text-xs text-subtle">0{i + 1}</span>
                <div>
                  <h2 className="font-medium">{title}</h2>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="faq" className="mt-24">
        <Reveal>
          <h2 id="faq" className="label text-center text-subtle">
            FAQ
          </h2>
        </Reveal>
        <div className="mt-6">
          <Faq items={FAQ} />
        </div>
      </section>
    </div>
  );
}
