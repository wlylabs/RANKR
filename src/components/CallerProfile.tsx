"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { formatDay, formatMultiple } from "@/lib/format";
import { useCallerProfile } from "@/lib/hooks";
import { accountsAvailable } from "@/lib/supabase-browser";
import { useAuth } from "./AuthProvider";
import { Avatar } from "./Avatar";
import { CallSpread, RecentForm } from "./CallerCharts";
import { toneOf } from "./MultipleBadge";
import { CallsView, callRow } from "./MyCalls";
import { OfficialBadge } from "./OfficialBadge";
import { SocialLinks } from "./Social";

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-8 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <UserRound className="mx-auto size-5 text-subtle" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{body}</p>
    </div>
  );
}

/** A caller's public page: who they are, their bio and links, how their calls did, and every call from their own entry. */
export function CallerProfile({ username }: { username: string }) {
  const { userId } = useAuth();
  const { data, error, isLoading } = useCallerProfile(username, accountsAvailable);
  const rows = useMemo(() => (data?.calls ?? []).map(callRow), [data]);
  const c = data?.caller;
  const about = data?.about;
  const mine = !!c && c.userId === userId;
  const since = rows.length ? Math.min(...rows.map((r) => r.calledAt)) : null;

  return (
    <div className="pt-10 sm:pt-14">
      <div className="flex items-center gap-4">
        <Avatar userId={c?.userId ?? null} size={56} />
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="truncate font-mono">@{c?.username ?? username}</span>
            {c?.official && <OfficialBadge className="size-5" />}
            {mine && (
              <span className="rounded border border-border px-1.5 font-mono text-[11px] font-normal text-muted">you</span>
            )}
          </h1>
          <p className="mt-1 font-mono text-xs text-subtle">
            {c ? (
              <>
                {c.hits} at 2x+ · {Math.round((c.wins / Math.max(c.calls, 1)) * 100)}% win · avg{" "}
                <span className={toneOf(c.avgMultiple)}>{formatMultiple(c.avgMultiple)}</span>
                {since && <> · calling since {formatDay(since)}</>}
              </>
            ) : (
              "caller"
            )}
          </p>
        </div>
        {mine && (
          <Link
            href="/account"
            className="ml-auto inline-flex h-8 shrink-0 items-center rounded-md border border-border px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Edit profile
          </Link>
        )}
      </div>

      {about?.bio && <p className="mt-5 max-w-xl text-sm text-pretty break-words">{about.bio}</p>}
      {about && <SocialLinks about={about} className={about.bio ? "mt-3" : "mt-5"} />}

      {!accountsAvailable ? (
        <Message title="No caller profiles here" body="This deployment runs without accounts, so calls have no names." />
      ) : error && !data ? (
        <Message title="Caller not found" body={`No one on Rankr goes by @${username}.`} />
      ) : !isLoading && data && !rows.length ? (
        <Message title="No calls yet" body={`@${data.caller.username} hasn't pasted a CA yet.`} />
      ) : (
        <>
          {rows.length > 0 && (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <CallSpread rows={rows} />
              <RecentForm rows={rows} />
            </div>
          )}
          <CallsView rows={rows} loading={isLoading} />
        </>
      )}
    </div>
  );
}
