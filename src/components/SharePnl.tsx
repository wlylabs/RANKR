"use client";

import clsx from "clsx";
import { Share2 } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { paperCardFile, paperCardQuery, paperShareText, type PaperCard } from "@/lib/share";
import { ShareSheet } from "./ShareCall";

/** A wallet's action: a round icon over its label (see WalletStrip). */
export const TILE =
  "group flex flex-col items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-40";
export const TILE_ICON =
  "grid size-12 place-items-center rounded-full bg-surface-2 text-fg transition-[background-color,scale] group-hover:bg-border group-active:scale-95";

/**
 * A paper PnL card's button, and the share dialog it opens (see ShareSheet). The amounts are left off the card
 * unless asked for: the move alone says how it went. `href`: the page the link goes to (the token's, or Swap).
 */
export function SharePnl({
  card,
  href,
  variant = "button",
  className,
}: {
  card: PaperCard;
  href: string;
  variant?: "button" | "action" | "icon" | "tile";
  className?: string;
}) {
  const [opened, setOpened] = useState(0);
  const label = card.kind === "wallet" ? "Share your PnL" : `Share your $${card.symbol} PnL`;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpened((n) => n + 1);
        }}
        aria-label={variant === "icon" ? label : undefined}
        title={variant === "icon" ? label : undefined}
        className={clsx(
          variant === "button" &&
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg",
          variant === "action" &&
            "inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg",
          variant === "tile" && TILE,
          variant === "icon" && "grid size-7 shrink-0 place-items-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg",
          className,
        )}
      >
        {variant === "tile" ? (
          <>
            <span className={TILE_ICON}>
              <Share2 className="size-[18px]" />
            </span>
            Share
          </>
        ) : (
          <>
            <Share2 className="size-3.5 shrink-0" />
            {variant !== "icon" && "Share PnL"}
          </>
        )}
      </button>
      {opened > 0 && createPortal(<PnlDialog key={opened} card={card} href={href} title={label} />, document.body)}
    </>
  );
}

function PnlDialog({ card, href, title }: { card: PaperCard; href: string; title: string }) {
  const [amounts, setAmounts] = useState(false);
  const shown: PaperCard = { ...card, amounts: amounts ? card.amounts : null };

  return (
    <ShareSheet
      title={title}
      subtitle="The card shows your PnL as it is right now."
      image={`/api/paper/card?${paperCardQuery(shown)}`}
      fileName={paperCardFile(card)}
      text={paperShareText(card)}
      href={href}
    >
      {card.amounts && (
        <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted select-none hover:text-fg">
          <input type="checkbox" checked={amounts} onChange={(e) => setAmounts(e.target.checked)} className="size-3.5 accent-[var(--fg)]" />
          Show amounts on the card
        </label>
      )}
    </ShareSheet>
  );
}
