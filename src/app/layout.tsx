import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { BottomNav, Footer, Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import "./globals.css";

// Geist Pixel Square: display type for headlines and big numbers.
const pixel = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Square.woff2",
  variable: "--font-rankr-pixel",
  weight: "500",
  display: "swap",
});

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
  openGraph: { siteName: "Rankr", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#f4f4f1" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${pixel.variable} dark`} suppressHydrationWarning>
      <body className="min-h-dvh overflow-x-clip font-sans">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">{children}</main>
          <Footer />
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
