"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

/**
 * The token's logo (DexScreener's image), or its first letter when it has none or the image fails.
 * Only https images are shown; they load lazily and send no referrer.
 */
export function TokenIcon({
  src,
  symbol,
  size = 28,
  className,
}: {
  src: string | null | undefined;
  symbol: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  const url = src?.startsWith("https://") && failed !== src ? src : null;

  // An image that failed before hydration never fires onError in React.
  useEffect(() => {
    const img = ref.current;
    if (url && img?.complete && img.naturalWidth === 0) setFailed(url);
  }, [url]);

  const box = { width: size, height: size };
  if (!url) {
    return (
      <span
        aria-hidden
        style={{ ...box, fontSize: Math.round(size * 0.42) }}
        className={clsx(
          "grid shrink-0 place-items-center rounded-full bg-surface-2 font-medium text-muted uppercase select-none",
          className,
        )}
      >
        {symbol.replace(/[^\p{L}\p{N}]/gu, "").charAt(0) || "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote logos from many hosts; no optimizer needed
    <img
      ref={ref}
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(url)}
      style={box}
      className={clsx("shrink-0 rounded-full bg-surface-2 object-cover", className)}
    />
  );
}
