import type { Metadata } from "next";
import { TraceIntro } from "@/components/trace/TraceIntro";

export const metadata: Metadata = {
  title: "Follow the money",
  description:
    "Paste a wallet. See where its money came from and where it went, hop by hop, down to the exchange it reached.",
};

export default function TracePage() {
  return <TraceIntro />;
}
