import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MAX_CLAIM_CENTS, MIN_CLAIM_CENTS, recordClaim } from "@/lib/entrants";
import { getPaymentProvider } from "@/lib/payments/provider";
import { dollarsToCents } from "@/lib/format";

export const runtime = "nodejs";

const claimSchema = z.object({
  entrantId: z.string().min(1).max(80).optional(),
  displayName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(40, "Name must be 40 characters or fewer."),
  amount: z
    .number()
    .finite()
    .positive("Amount must be greater than zero."),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const amountCents = dollarsToCents(parsed.data.amount);

  if (amountCents < MIN_CLAIM_CENTS) {
    return NextResponse.json(
      { error: `Minimum claim is $${(MIN_CLAIM_CENTS / 100).toFixed(2)}.` },
      { status: 400 },
    );
  }
  if (amountCents > MAX_CLAIM_CENTS) {
    return NextResponse.json(
      { error: `Maximum claim is $${(MAX_CLAIM_CENTS / 100).toLocaleString()}.` },
      { status: 400 },
    );
  }

  const provider = getPaymentProvider();
  const charge = await provider.charge({
    amountCents,
    displayName: parsed.data.displayName,
  });

  if (!charge.success) {
    return NextResponse.json({ error: charge.error }, { status: 402 });
  }

  try {
    const result = recordClaim({
      entrantId: parsed.data.entrantId,
      displayName: parsed.data.displayName,
      amountCents,
    });
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Could not record your claim. Please try again." },
      { status: 500 },
    );
  }
}
