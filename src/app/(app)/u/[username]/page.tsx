import type { Metadata } from "next";
import { CallerProfile } from "@/components/CallerProfile";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const name = decodeURIComponent(username);
  return {
    title: `@${name}`,
    description: `Every call by @${name} on Rankr, measured from their own entry.`,
  };
}

export default async function CallerPage({ params }: Props) {
  const { username } = await params;
  return <CallerProfile username={decodeURIComponent(username)} />;
}
