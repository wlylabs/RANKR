"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useCallerProfile } from "@/lib/hooks";
import { accountsAvailable } from "@/lib/supabase-browser";
import { useAuth } from "./AuthProvider";
import { CallSpread, RecentForm } from "./CallerCharts";
import { CallsView, callRow } from "./MyCalls";
import { PROFILE_ACTION, ProfileHeader } from "./ProfileHeader";

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
      <ProfileHeader
        userId={c?.userId ?? null}
        username={c?.username ?? username}
        official={!!c?.official}
        stats={c ?? null}
        since={since}
        about={about}
        you={mine}
        actions={
          mine && (
            <Link href="/account" className={PROFILE_ACTION}>
              Edit profile
            </Link>
          )
        }
      />

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
          <CallsView rows={rows} loading={isLoading} shareAs={c?.username} />
        </>
      )}
    </div>
  );
}
