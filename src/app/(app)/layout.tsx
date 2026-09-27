import { BottomNav, Footer, Header } from "@/components/Header";
import { MilestoneAlerts } from "@/components/MilestoneAlerts";

/** The app shell: header with the Track button, bottom nav on mobile. The landing page at / has its own. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">{children}</main>
      <Footer />
      <BottomNav />
      <MilestoneAlerts />
    </>
  );
}
