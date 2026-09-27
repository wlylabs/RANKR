import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { PwaRegister } from "@/components/Pwa";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  title: { default: "Rankr: paste a CA, track the x", template: "%s · Rankr" },
  description:
    "Paste a memecoin contract address. Rankr locks the market cap at that moment and tracks every 2x, 5x, 10x (or the drawdown) from there.",
  applicationName: "Rankr",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Rankr", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: { siteName: "Rankr", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`} suppressHydrationWarning>
      <body className="min-h-dvh overflow-x-clip font-sans">
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
