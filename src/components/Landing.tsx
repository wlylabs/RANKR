"use client";

import clsx from "clsx";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useTokens } from "@/lib/hooks";
import { APP_HOME } from "@/lib/login";
import { isStandalone } from "@/lib/pwa";
import { useAuth } from "./AuthProvider";
import { Reveal } from "./Cinema";
import { LiveDot } from "./PageHeader";
import { ListSkeleton, TokenRow } from "./TokenList";

/**
 * The installed app opens on /app; if it ever lands on the landing page (e.g. added from /), go there.
 * Except right after signing out: that ends on the landing page, in the installed app too.
 */
export function StandaloneRedirect() {
  const router = useRouter();
  const { justSignedOut } = useAuth();
  useEffect(() => {
    if (isStandalone() && !justSignedOut) router.replace(APP_HOME);
  }, [justSignedOut, router]);
  return null;
}

/**
 * One FAQ entry that opens and closes smoothly (a native <details> just pops open). The height animates
 * through grid rows, 0fr to 1fr, which works in every browser; closed answers are inert, so screen readers
 * and the tab key skip them. Button + aria-expanded + aria-controls, as in the WAI-ARIA accordion pattern.
 */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-t border-border">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-4 py-4 text-left font-medium"
        >
          {q}
          <Plus
            className={clsx(
              "size-4 shrink-0 text-subtle transition-transform duration-300 ease-emphasized",
              open && "rotate-45",
            )}
          />
        </button>
      </h3>
      <div
        id={id}
        inert={!open}
        className={clsx(
          "grid ease-emphasized [transition-property:grid-template-rows,opacity]",
          open ? "grid-rows-[1fr] opacity-100 duration-300" : "grid-rows-[0fr] opacity-0 duration-200",
        )}
      >
        <div className="overflow-hidden">
          <p className="max-w-2xl pb-5 text-sm text-pretty text-muted">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="border-b border-border">
      {items.map((item, i) => (
        <Reveal key={item.q} delay={i * 90}>
          <FaqItem {...item} />
        </Reveal>
      ))}
    </div>
  );
}

const PREVIEW_ROWS = 5;

/**
 * The product itself, under the hero: the board's top runners right now, live, in a frame lit from behind.
 * It tips upright as it scrolls into view (.tilt-in) and its last row fades into the page, like a shot that
 * runs on past the edge. Rows open their token pages. Nothing shows until there's a token to show.
 */
export function BoardPreview() {
  const { tokens, isLoading } = useTokens({ sort: "top", limit: PREVIEW_ROWS });
  if (!isLoading && !tokens.length) return null;
  return (
    <section aria-label="Top runners right now" className="relative isolate pb-20 sm:pb-28">
      <div
        aria-hidden
        className="absolute inset-x-[10%] top-6 -z-10 h-2/3 rounded-full bg-fg opacity-[0.07] blur-3xl"
      />
      <div className="tilt-in card overflow-hidden bg-bg [mask-image:linear-gradient(to_bottom,#000_72%,transparent)]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <LiveDot />
            Top runners
          </span>
          <Link href="/leaderboard" className="font-mono text-[11px] text-subtle transition-colors hover:text-fg">
            live from the board
          </Link>
        </div>
        {isLoading ? (
          <ListSkeleton rows={PREVIEW_ROWS} />
        ) : (
          <div className="divide-y divide-border">
            {tokens.map((t, i) => (
              <TokenRow key={t.id} token={t} rank={i + 1} meta="peak" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
