# RANKR

A leaderboard where **value decides the top**. Claim a rank with a contribution;
outbid the entrant above you to rise, get outbid and you slide back down. No
ties — the tie-break always favors whoever held a value first.

## Stack

- **Next.js 16** (App Router, Turbopack, React 19)
- **TypeScript**, strict mode
- **Tailwind CSS v4** — CSS-first theme in `src/app/globals.css`
- **Framer Motion** — layout/FLIP animations drive the rank-shift effect
- **Radix UI Dialog** — accessible claim sheet (modal on desktop, bottom sheet on mobile)
- **SWR** — polling client for live leaderboard state
- **`node:sqlite`** (Node's built-in driver) — zero native deps, zero external services
- **Zod** — request validation

## How the mechanic works

Every "claim" is a payment tied to an entrant. Entrants are ranked by total
contributed value (`total_cents`), and ties are broken in favor of whoever
reached that value first — so you must **strictly exceed** the entrant above
you to take their spot, matching the "pay above to move up" rule. The `Take
#1` shortcut in the claim sheet does the math for you.

Returning visitors are remembered (via a local entrant id, no accounts) so a
second visit tops up their existing rank instead of creating a duplicate
entrant.

## Payments

Payments run through a small `PaymentProvider` interface
(`src/lib/payments/provider.ts`). The shipped implementation is a **demo
provider** that settles instantly with no external calls — this lets the
whole product be evaluated end to end without live credentials. Swap in a
real processor (e.g. Stripe PaymentIntents) behind the same interface;
nothing above `lib/payments` needs to change. The UI is explicit about this
via the "Demo mode" note in the footer.

## Data layer

Entrants and payments live in a local SQLite file (`data/rankr.sqlite`,
git-ignored) via Node's built-in `node:sqlite` module — no native bindings to
compile, no external database to provision. This suits a single-instance
deployment (a long-running Node process, e.g. Docker or a VPS). It is not
suited to serverless/multi-instance hosting, where the file wouldn't be
shared across instances — for that, swap `src/lib/db.ts` and
`src/lib/entrants.ts` for a hosted database; the rest of the app talks to
those modules through plain functions, not SQL directly.

## Getting started

```bash
npm install
npm run db:seed   # optional — populates a demo leaderboard
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command            | Description                              |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start the dev server (Turbopack)          |
| `npm run build`     | Production build                          |
| `npm run start`     | Run the production build                  |
| `npm run lint`      | ESLint                                    |
| `npm run db:seed`   | Seed `data/rankr.sqlite` with demo entrants |

## Project structure

```
src/
  app/                 Routes: home page, /api/leaderboard, /api/claim
  components/          UI: navbar, hero, podium, leaderboard list, claim sheet
  components/ui/       Small primitives: button, input, dialog, toast
  hooks/               useLeaderboard (SWR polling), useMyEntrant (local identity)
  lib/                 db, entrants (ranking/claim logic), payments, formatting
  types/               Shared types
scripts/seed.ts        Demo data seeder
```
