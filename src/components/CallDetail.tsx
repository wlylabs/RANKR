"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import useSWR from "swr";
import { callerHref, formatMultiple, formatUsd, shortAddress, tokenHref } from "@/lib/format";
import { fetcher } from "@/lib/hooks";
import { delay } from "@/lib/motion";
import type { CallResponse } from "@/lib/types";
import { Avatar } from "./Avatar";
import { CopyButton } from "./CopyButton";
import { DecryptText } from "./DecryptText";
import { ChangeText, Flash, toneOf } from "./MultipleBadge";
import { OfficialBadge } from "./OfficialBadge";
import { ShareCall } from "./ShareCall";

const GHOST =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg";

/**
 * One caller's call on one token, live: who called it, at what market cap, and how far it has moved since
 * their own entry. Where a shared call card leads; from here, the token itself and the caller's other calls.
 */
export function CallDetail({
  username,
  chain,
  address,
  initial,
}: {
  username: string;
  chain: string;
  address: string;
  initial: CallResponse | null;
}) {
  const key = `/api/callers/${encodeURIComponent(username)}/${chain}/${encodeURIComponent(address)}`;
  const { data } = useSWR<CallResponse>(initial ? key : null, fetcher, {
    fallbackData: initial ?? undefined,
    refreshInterval: 15_000,
    revalidateOnMount: false,
  });
  const found = data ?? initial;
  if (!found) return <NotFound username={username} />;

  const { caller, call } = found;
  const t = call.token;
  const moved = call.multiple > 1.005 || call.multiple < 0.995;

  return (
    <div className="mx-auto max-w-2xl pt-6 sm:pt-10">
      <Link href={callerHref(caller.username)} className="text-sm text-muted hover:text-fg">
        @{caller.username}&apos;s calls
      </Link>

      <section className="cine-in card relative isolate mt-6 overflow-hidden">
        {/* The number lights the card, green or red, as on the token page and the share card. */}
        {moved && (
          <div
            aria-hidden
            className="pnl-glow pointer-events-none absolute inset-0 -z-10"
            style={{ "--glow": call.multiple > 1 ? "var(--up)" : "var(--down)" } as CSSProperties}
          />
        )}
        <div className="p-5 sm:p-8">
          <div className="flex items-center gap-3">
            <Avatar userId={caller.userId} size={40} />
            <div className="min-w-0">
              <Link
                href={callerHref(caller.username)}
                className="flex min-w-0 items-center gap-1 font-mono text-sm hover:underline"
              >
                <span className="truncate">@{caller.username}</span>
                {caller.official && <OfficialBadge />}
              </Link>
              <p className="flex min-w-0 items-baseline gap-1.5 text-sm text-muted">
                called
                <Link href={tokenHref(t)} className="font-medium text-fg hover:underline">
                  ${t.symbol}
                </Link>
                <span className="truncate text-subtle">{t.name}</span>
              </p>
            </div>
          </div>

          <div className="label mt-8 text-subtle">Since the call</div>
          <div
            className={`tabular relative isolate mt-3 w-fit font-mono text-7xl leading-none font-medium tracking-[-0.06em] sm:text-8xl ${toneOf(call.multiple, "text-fg")}`}
          >
            <Flash value={call.multiple} />
            <DecryptText text={formatMultiple(call.multiple)} duration={700} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px]">
            {/* A loss already reads as a percentage above; a gain gets its percentage here. */}
            {call.multiple > 1.005 && <ChangeText multiple={call.multiple} />}
            <span className="tabular text-muted">
              entry {formatUsd(call.entryMarketCap)} · now <span className="text-fg">{formatUsd(t.marketCap)}</span>
            </span>
          </div>
        </div>

        {/* The contract address, to copy: the one thing here to act on. */}
        <div className="flex items-center gap-3 border-t border-border px-5 py-3 font-mono text-[11px] sm:px-8">
          <span className="text-subtle">ca</span>
          <CopyButton value={t.address} label={shortAddress(t.address)} />
        </div>
      </section>

      <div className="cine-in mt-4 flex flex-wrap gap-2" style={delay(150)}>
        <ShareCall
          variant="primary"
          call={{ username: caller.username, token: t, entryMarketCap: call.entryMarketCap, multiple: call.multiple }}
        />
        <Link href={tokenHref(t)} className={GHOST}>
          ${t.symbol} chart
        </Link>
      </div>
    </div>
  );
}

function NotFound({ username }: { username: string }) {
  return (
    <div className="mx-auto max-w-2xl pt-6 sm:pt-10">
      <div className="mt-8 rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <CircleAlert className="mx-auto size-5 text-subtle" />
        <p className="mt-3 font-medium">No call here</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          @{username} hasn&apos;t called this token.
        </p>
        <Link href={callerHref(username)} className={`mt-5 ${GHOST}`}>
          @{username}&apos;s calls
        </Link>
      </div>
    </div>
  );
}
