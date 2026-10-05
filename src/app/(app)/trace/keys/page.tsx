import type { Metadata } from "next";
import { TraceKeys } from "@/components/trace/TraceKeys";

export const metadata: Metadata = {
  title: "Your API keys",
  description: "The API keys Trace reads the chains on: your own, free from each provider.",
};

export default function TraceKeysPage() {
  return <TraceKeys />;
}
