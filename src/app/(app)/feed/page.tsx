import type { Metadata } from "next";
import { Suspense } from "react";
import { Feed } from "@/components/Feed";

export const metadata: Metadata = {
  title: "Feed",
  description: "Every call on Rankr as it lands, and every call that hits 2x, 5x, 10x and up.",
};

export default function FeedPage() {
  return (
    <Suspense>
      <Feed />
    </Suspense>
  );
}
