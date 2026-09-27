import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
