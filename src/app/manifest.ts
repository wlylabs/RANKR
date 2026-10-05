import type { MetadataRoute } from "next";

/** The installed app opens straight into /app; the landing page at / stays for the web. */
export default function manifest(): MetadataRoute.Manifest {
  const icon = [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }];
  return {
    id: "/app",
    name: "Rankr",
    short_name: "Rankr",
    description: "Paste a memecoin CA and track the x from that moment.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "en",
    dir: "ltr",
    categories: ["finance", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Track a token", short_name: "Track", url: "/app#paste", icons: icon },
      { name: "Feed", url: "/feed", icons: icon },
      { name: "Swap", url: "/swap", icons: icon },
    ],
  };
}
