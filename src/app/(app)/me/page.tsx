import type { Metadata } from "next";
import { Suspense } from "react";
import { MyCalls } from "@/components/MyCalls";

export const metadata: Metadata = {
  title: "You",
  description: "Your calls, measured from the moment you pasted them, how they're doing, and your watchlist.",
};

export default function YouPage() {
  return (
    <Suspense>
      <MyCalls />
    </Suspense>
  );
}
