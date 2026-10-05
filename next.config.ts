import type { NextConfig } from "next";

/** The fonts the drawn cards read from disk (src/lib/og.tsx): a path built at runtime isn't traced on its own. */
const OG_FONTS = [
  "./node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf",
  "./node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf",
  "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Medium.ttf",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Without them a deployed card falls back to the default font: no mono numbers, no bold.
  outputFileTracingIncludes: {
    "/api/paper/card": OG_FONTS,
    "/api/callers/**/card": OG_FONTS,
    "/opengraph-image*": OG_FONTS,
    "/t/**/opengraph-image*": OG_FONTS,
  },
  async headers() {
    return [
      {
        // The service worker must never be served from a cache, or updates would not reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // The app used to live at /. A paste waiting on sign-in (/?ca=...) resumes in the app.
      { source: "/", has: [{ type: "query", key: "ca" }], destination: "/app", permanent: false },
    ];
  },
};

export default nextConfig;
