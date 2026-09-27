import type { Metadata } from "next";
import { MyCalls } from "@/components/MyCalls";

export const metadata: Metadata = {
  title: "My calls",
  description: "The tokens you pasted, measured from the moment you pasted them.",
};

export default function MyCallsPage() {
  return <MyCalls />;
}
