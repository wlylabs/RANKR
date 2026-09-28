import type { Metadata } from "next";
import { Suspense } from "react";
import { News } from "@/components/News";

export const metadata: Metadata = {
  title: "News",
  description: "Headlines that name the tokens tracked on Rankr, each linking to the article.",
};

export default function NewsPage() {
  return (
    <Suspense>
      <News />
    </Suspense>
  );
}
