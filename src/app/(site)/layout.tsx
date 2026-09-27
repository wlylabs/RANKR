import Link from "next/link";
import { StandaloneRedirect } from "@/components/Landing";
import { Logo, RANKR_SHA256 } from "@/components/Logo";
import { SettingsMenu } from "@/components/SettingsMenu";
import { APP_HOME } from "@/lib/login";

const SECTIONS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
];

const FOOTER = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/me", label: "My calls" },
];

/** The landing page's own shell: section links instead of the app's nav; the app is in the settings menu. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StandaloneRedirect />
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Rankr" className="shrink-0">
            <Logo size={24} />
          </Link>
          <nav className="hidden items-center gap-5 md:flex" aria-label="Sections">
            {SECTIONS.map(({ href, label }) => (
              <a key={href} href={href} className="text-sm text-muted transition-colors hover:text-fg">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link href={APP_HOME} className="text-sm text-muted transition-colors hover:text-fg">
              App
            </Link>
            <SettingsMenu openApp />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">{children}</main>

      <footer className="mt-24 border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0 space-y-2">
            <Logo size={20} />
            <p className="max-w-full truncate font-mono text-[11px] text-subtle" title={`sha256("rankr") = ${RANKR_SHA256}`}>
              sha256(&quot;rankr&quot;) = {RANKR_SHA256.slice(0, 16)}…{RANKR_SHA256.slice(-8)}
            </p>
            <p className="text-xs text-subtle">Not financial advice. Memecoins can and do go to zero.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {FOOTER.map(({ href, label }) => (
              <Link key={href} href={href} className="hover:text-fg">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </>
  );
}
