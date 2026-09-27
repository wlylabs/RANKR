import Link from "next/link";
import { StandaloneRedirect } from "@/components/Landing";
import { Logo } from "@/components/Logo";
import { SettingsMenu } from "@/components/SettingsMenu";
import { APP_HOME } from "@/lib/login";

/** The landing page's own shell: just the logo, the app link and settings. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grain">
      <StandaloneRedirect />
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
          <Link href="/" aria-label="Rankr" className="shrink-0">
            <Logo size={24} />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Link href={APP_HOME} className="text-sm text-muted transition-colors hover:text-fg">
              App
            </Link>
            <SettingsMenu openApp />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">{children}</main>

      <footer className="mt-24 border-t border-border px-4 pb-[env(safe-area-inset-bottom)] sm:px-6">
        {/* Same column as the page, so every edge lines up. */}
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <Logo size={20} />
          <p className="text-xs text-subtle">Not financial advice. Memecoins can go to zero.</p>
        </div>
      </footer>
    </div>
  );
}
