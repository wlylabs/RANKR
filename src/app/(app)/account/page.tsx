import type { Metadata } from "next";
import { Account } from "@/components/Account";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false },
};

export default function AccountPage() {
  return <Account />;
}
