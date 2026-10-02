import { PageHeader } from "@/components/PageHeader";
import { TrailField } from "@/components/trace/TraceCinema";
import { TraceInput } from "@/components/trace/TraceInput";
import { delay } from "@/lib/motion";

/**
 * A trail link that isn't one (a chain Trace doesn't read, or not a wallet address): still the Trace tab, on its
 * ledger, with the box to paste the wallet again, instead of a bare 404.
 */
export default function TraceNotFound() {
  return (
    <div className="relative isolate space-y-8 pt-8 sm:pt-12">
      <TrailField />
      <PageHeader title="No trail here">
        That link isn&apos;t a wallet Rankr can trace. Paste a wallet address, or a Solscan, Etherscan, Basescan,
        Arbiscan, Optimism or Polygonscan link.
      </PageHeader>
      <div className="cine-in max-w-2xl" style={delay(160)}>
        <TraceInput size="lg" autoFocus />
      </div>
    </div>
  );
}
