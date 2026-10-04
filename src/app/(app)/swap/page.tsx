import type { Metadata } from "next";
import { Suspense } from "react";
import { Swap } from "@/components/Swap";

export const metadata: Metadata = {
  title: "Swap",
  description: "Paste a token, pick how much, swap: on paper, with no real money, priced from the token's live pool.",
};

export default function SwapPage() {
  return (
    <Suspense>
      <Swap />
    </Suspense>
  );
}
