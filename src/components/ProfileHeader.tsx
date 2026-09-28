import { formatDay, formatMultiple } from "@/lib/format";
import type { CallerAbout, CallerView } from "@/lib/types";
import { Avatar } from "./Avatar";
import { toneOf } from "./MultipleBadge";
import { OfficialBadge } from "./OfficialBadge";
import { SocialLinks } from "./Social";

/** A button next to the name (Edit profile, Public page). */
export const PROFILE_ACTION =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg";

/** The top of a caller's public page and of "You": avatar, name, board numbers, bio and links. */
export function ProfileHeader({
  userId,
  username,
  official,
  stats,
  since,
  about,
  you = false,
  actions,
}: {
  userId: string | null;
  username: string;
  official: boolean;
  /** Board numbers; null while unknown. */
  stats: Pick<CallerView, "calls" | "hits" | "wins" | "avgMultiple"> | null;
  /** When the first call was made. */
  since: number | null;
  about: CallerAbout | null | undefined;
  /** A "you" badge: your own public page. */
  you?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar userId={userId} size={56} />
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="truncate font-mono">@{username}</span>
            {official && <OfficialBadge className="size-5" />}
            {you && <span className="rounded border border-border px-1.5 font-mono text-[11px] font-normal text-muted">you</span>}
          </h1>
          <p className="mt-1 font-mono text-xs text-subtle">
            {stats ? (
              <>
                {stats.hits} at 2x+ · {Math.round((stats.wins / Math.max(stats.calls, 1)) * 100)}% win · avg{" "}
                <span className={toneOf(stats.avgMultiple)}>{formatMultiple(stats.avgMultiple)}</span>
                {since && <> · calling since {formatDay(since)}</>}
              </>
            ) : (
              "caller"
            )}
          </p>
        </div>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {about?.bio && <p className="mt-5 max-w-xl text-sm text-pretty break-words">{about.bio}</p>}
      {about && <SocialLinks about={about} className={about.bio ? "mt-3" : "mt-5"} />}
    </>
  );
}
