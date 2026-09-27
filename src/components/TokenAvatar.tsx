"use client";

import clsx from "clsx";
import { useState } from "react";
import { chainIconUrl, chainMeta } from "@/lib/chains";

function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** Token logo with a generated fallback, plus a small chain badge in the corner. */
export function TokenAvatar({
  symbol,
  imageUrl,
  chainId,
  seed,
  size = 40,
  showChain = true,
}: {
  symbol: string;
  imageUrl: string | null;
  chainId: string;
  seed: string;
  size?: number;
  showChain?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [chainBroken, setChainBroken] = useState(false);
  const h = hue(seed);
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
          className="size-full rounded-full bg-surface-2 object-cover"
        />
      ) : (
        <span
          className="grid size-full place-items-center rounded-full font-bold text-white"
          style={{
            background: `linear-gradient(135deg, hsl(${h} 80% 55%), hsl(${(h + 60) % 360} 75% 40%))`,
            fontSize: size * 0.36,
          }}
        >
          {symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?"}
        </span>
      )}
      {showChain && (
        <span
          className="absolute -right-0.5 -bottom-0.5 grid place-items-center overflow-hidden rounded-full ring-2 ring-surface"
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
        "inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase",
        className,
      )}
    >
      <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.short}
    </span>
  );
}
