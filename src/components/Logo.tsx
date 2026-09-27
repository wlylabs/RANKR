import clsx from "clsx";

/** Brand geometry, shared with the favicon, app icons and social cards. */
export const BRAND = {
  orange: "#FF5B14",
  ink: "#0A0A0A",
  /** Bold pixel "r" plus a lone pixel breaking out above it (the pump). 64x64 grid. */
  markPath: "M10 24H40V30H28V36H22V54H10Z M46 12h6v6h-6z",
  /** "rankr" set in Geist Pixel Square, outlined. */
  wordmarkPath:
    "M7.6 0V-7.6H15.2V-45.6H7.6V-53.2H22.8V-45.6H26.6V-41.8H22.8V-7.6H34.2V0ZM26.6 -45.6V-49.4H30.4V-53.2H41.8V-45.6Z M53.2 -7.6V-22.8H57V-26.6H64.6V-30.4H83.6V-34.2H87.4V-41.8H83.6V-45.6H64.6V-41.8H60.8V-38H53.2V-45.6H57V-49.4H64.6V-53.2H83.6V-49.4H91.2V-41.8H95V-7.6H98.8V0H91.2V-3.8H87.4V-7.6H83.6V-11.4H87.4V-26.6H83.6V-22.8H64.6V-19H60.8V-7.6H83.6V-3.8H79.8V0H60.8V-3.8H57V-7.6Z M144.4 0V-41.8H140.6V-45.6H121.6V-49.4H125.4V-53.2H144.4V-49.4H148.2V-45.6H152V0ZM110.2 0V-53.2H117.8V-45.6H121.6V-41.8H117.8V0Z M167.2 0V-72.2H174.8V-26.6H178.6V-30.4H182.4V-34.2H186.2V-38H190V-41.8H193.8V-45.6H197.6V-49.4H201.4V-53.2H209V-45.6H205.2V-41.8H201.4V-38H197.6V-34.2H193.8V-30.4H190V-26.6H193.8V-22.8H197.6V-19H201.4V-15.2H205.2V-11.4H209V0H201.4V-7.6H197.6V-11.4H193.8V-15.2H190V-19H186.2V-22.8H182.4V-19H178.6V-15.2H174.8V0Z M220.4 0V-7.6H228V-45.6H220.4V-53.2H235.6V-45.6H239.4V-41.8H235.6V-7.6H247V0ZM239.4 -45.6V-49.4H243.2V-53.2H254.6V-45.6Z",
  wordmarkViewBox: "7.6 -72.2 247 72.2",
};

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="12" fill={BRAND.orange} />
      <path d={BRAND.markPath} fill={BRAND.ink} shapeRendering="crispEdges" />
    </svg>
  );
}

export function Wordmark({ height = 18, className }: { height?: number; className?: string }) {
  return (
    <svg
      height={height}
      width={(height * 247) / 72.2}
      viewBox={BRAND.wordmarkViewBox}
      className={className}
      aria-hidden="true"
    >
      <path d={BRAND.wordmarkPath} fill="currentColor" />
    </svg>
  );
}

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <Wordmark height={Math.round(size * 0.62)} />
      <span className="sr-only">rankr</span>
    </span>
  );
}
