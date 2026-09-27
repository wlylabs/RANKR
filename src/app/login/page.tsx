import type { Metadata } from "next";
import { Suspense } from "react";
import { Login } from "@/components/Login";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Rankr with an email link to paste CAs and get ranked on the caller board.",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
