import { CallTicker } from "@/components/CallTicker";
import { BottomNav, Header } from "@/components/Header";
import { MilestoneAlerts } from "@/components/MilestoneAlerts";

/** The app shell: header with the Track button, the live call ticker, bottom nav on mobile. The landing page at / has its own. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // Its own stacking context, so the light (behind everything, -z-10) still sits above the page background.
    <div className="relative isolate">
      <div aria-hidden className="ambient pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem]" />
      <Header />
      <CallTicker />
      {/* Bottom padding keeps the end of the page clear of the bottom nav on phones. */}
      <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-20">{children}</main>
      <BottomNav />
      <MilestoneAlerts />
    </div>
  );
}
