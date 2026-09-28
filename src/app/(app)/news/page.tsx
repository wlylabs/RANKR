import type { Metadata } from "next";
import { Suspense } from "react";
import { News } from "@/components/News";

export const metadata: Metadata = {
  title: "News",
  description: "What's in the news right now, and every token named after a story.",
};

export default function NewsPage() {
  return (
    <Suspense>
      <News />
    </Suspense>
  );
}
