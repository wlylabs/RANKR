"use client";

import clsx from "clsx";
import { useState } from "react";
import { chainIconUrl, chainMeta } from "@/lib/chains";

/** Token logo with a generated fallback, plus a small chain badge in the corner. */
export function TokenAvatar({
  symbol,
  imageUrl,
  chainId,
  size = 40,
  showChain = true,
}: {
  symbol: string;
  imageUrl: string | null;
  chainId: string;
  size?: number;
  showChain?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [chainBroken, setChainBroken] = useState(false);
  const chip = Math.max(14, Math.round(size * 0.4));

  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {imageUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setBroken(true)}
          className="size-full rounded-lg bg-surface-2 object-cover"
        />
      ) : (
        <span
          className="grid size-full place-items-center rounded-lg border border-border bg-surface-2 font-pixel text-muted"
          style={{ fontSize: size * 0.42 }}
        >
          {symbol.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?"}
        </span>
      )}
      {showChain && (
        <span
          className="absolute -right-1 -bottom-1 grid place-items-center overflow-hidden rounded-full ring-2 ring-surface"
          style={{ width: chip, height: chip, background: chainMeta(chainId).color }}
          title={chainMeta(chainId).name}
        >
          {!chainBroken && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={chainIconUrl(chainId)}
              alt=""
              className="size-full object-cover"
              onError={() => setChainBroken(true)}
            />
          )}
        </span>
      )}
    </span>
  );
}

export function ChainBadge({ chainId, className }: { chainId: string; className?: string }) {
  const meta = chainMeta(chainId);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded border border-border px-1 py-px font-mono text-[10px] leading-4 tracking-wide text-muted uppercase",
        className,
      )}
      title={meta.name}
    >
      <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.short}
    </span>
  );
}
