import { generateId } from "@/lib/id";

export interface ChargeInput {
  amountCents: number;
  displayName: string;
}

export type ChargeResult =
  | { success: true; reference: string }
  | { success: false; error: string };

export interface PaymentProvider {
  readonly name: string;
  charge(input: ChargeInput): Promise<ChargeResult>;
}

/**
 * Demo-mode provider: settles instantly so the product can be evaluated
 * end to end without live payment credentials. Swap PAYMENT_PROVIDER for a
 * real implementation (e.g. Stripe PaymentIntents) behind this same
 * interface — nothing above `lib/payments` needs to change.
 */
class DemoPaymentProvider implements PaymentProvider {
  readonly name = "demo";

  async charge(input: ChargeInput): Promise<ChargeResult> {
    await new Promise((resolve) => setTimeout(resolve, 350 + Math.random() * 300));

    if (input.amountCents <= 0) {
      return { success: false, error: "Amount must be greater than zero." };
    }

    return { success: true, reference: generateId("demo_charge") };
  }
}

let activeProvider: PaymentProvider | undefined;

export function getPaymentProvider(): PaymentProvider {
  if (!activeProvider) {
    activeProvider = new DemoPaymentProvider();
  }
  return activeProvider;
}
