import type { Metadata } from "next";
import { UsageView } from "@/components/trace/UsageView";

export const metadata: Metadata = {
  title: "API usage",
  description: "How much of each free API's limit Rankr has used, and when it starts over.",
};

export default function TraceUsagePage() {
  return <UsageView />;
}
