import type { Metadata } from "next";
import { TraceGate } from "@/components/trace/TraceGate";

// Trace is private (official accounts only): its pages stay out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function TraceLayout({ children }: { children: React.ReactNode }) {
  return <TraceGate>{children}</TraceGate>;
}
