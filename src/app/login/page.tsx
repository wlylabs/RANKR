import type { Metadata } from "next";
import { Suspense } from "react";
import { Login } from "@/components/Login";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Rankr as a guest or with your key to paste CAs and get ranked on the caller board.",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
