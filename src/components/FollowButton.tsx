"use client";

import clsx from "clsx";
import { Check, Plus } from "lucide-react";
import { toggleFollow, useFollowing, type Followed } from "@/lib/following";

/** Follow a caller on this device: their calls and milestones show under "Following" in the feed. */
export function FollowButton({ caller, className }: { caller: Followed; className?: string }) {
  const followed = useFollowing().some((f) => f.userId === caller.userId);
  return (
    <button
      type="button"
      onClick={() => toggleFollow(caller)}
      aria-pressed={followed}
      className={clsx(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
        followed ? "border border-border text-muted hover:text-fg" : "bg-fg text-bg hover:opacity-85",
        className,
      )}
    >
      {followed ? <Check className="size-3.5" /> : <Plus className="size-3.5" strokeWidth={2.5} />}
      {followed ? "Following" : "Follow"}
    </button>
  );
}
