# rankr

**Paste a CA. Watch it rank.**

Rankr is a memecoin call tracker. Paste a token contract address (or a pump.fun / DexScreener / GMGN / Birdeye /
explorer link) and Rankr records the price and market cap at that exact moment. From then on it tracks the token live
and shows how far it has moved since the paste: 2x, 5x, 10x, 100x... or the drawdown (-45%, -90%).

## Features

- **Paste to track**: auto-detects the chain and picks the most liquid DEX pair via the DexScreener API.
  Pasting a valid CA tracks it instantly, no extra click.
- **Entry locked at the first paste**: later pastes of the same token keep the original entry and bump a paste counter.
- **Live multiple**: current price / entry price, shown as `3.42x` for gains and `-37.2%` for losses.
  Peak and lowest point since the paste are recorded too.
- **Leaderboard**: top gainers, peak x, biggest dumps, newest, most pasted. Filter by 24h / 7d / 30d, chain, and search.
- **My calls**: every token you pasted, measured from *your* paste. Saved in the browser, or synced to your
  wallet when connected.
- **Caller leaderboard**: connected wallets ranked by their calls (2x hits, average x, best call).
- **Token page**: big multiple, milestone ladder (2x → 1000x with target market caps), SHA-256 entry seal, stats,
  DexScreener chart, share to X / native share, and a generated social card per token.
- Responsive (bottom nav on mobile, table on desktop), dark and light theme, installable as a PWA.

## Design

Minimal, monochrome, cryptography-flavoured. References: Vercel's Geist design system (monochrome, Swiss,
hairline borders), "decrypted text" reveal effects, and hash visualisations such as identicons / SSH randomart.

- **Logo**: the letter "r" on a 5x5 matrix. The other 18 cells come from `SHA-256("rankr")`
  (`fa7f36c0…4e3a`): cell *i* gets a dot when bit pair *i* of the digest is `11`. The mark is literally the
  name's hash, so no other name produces it. `src/lib/logo.test.ts` recomputes the digest and checks the favicon.
- **Entry seal**: every token gets `sha256(chain:address:entryPrice:firstPastedAt)`, shown on the token page and
  after a paste. Anyone can recompute it, so an edited entry would no longer match.
- **UI**: black / white / greys, color only for P&L (green up, red down). No token icons: tokens are shown as
  ticker + name. Geist Sans for text, Geist Mono for numbers, addresses and hashes. The hero headline and the
  big multiple "decrypt" out of random hex on first load (skipped with reduced motion).
- Colors live as CSS variables in `src/app/globals.css` (dark and light).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · SWR. Market data from the public
[DexScreener API](https://docs.dexscreener.com/api/reference) (no key needed).

## Run it

```bash
npm install
npm run dev          # http://localhost:3000, live DexScreener data
npm run dev:mock     # offline demo with synthetic prices (RANKR_MOCK=1)
npm test             # unit tests
npm run build && npm start
```

## Storage: Supabase

Rankr runs on a JSON file locally and on **Supabase (Postgres)** in production. Supabase fits the concept:

- the leaderboard is sorted, filtered and paged by Postgres (indexed), not in the browser;
- **"no backdating" is enforced by the database**: a trigger rejects any change to a token's entry;
- a paste is one atomic SQL call, so simultaneous pastes never lose a count;
- browsers can only read (RLS); every write goes through the server with the secret key;
- wallet accounts (Supabase Auth, Sign in with Web3) sync "My calls" and power the caller leaderboard.

### Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the whole of **`supabase/setup.sql`** and run it. It contains every migration in
   the right order and is safe to run again. (With the Supabase CLI instead: `supabase link`, `supabase db push`.)
   Running `…_rankr_callers.sql` on its own before `…_rankr_tokens.sql` fails with
   `relation "public.tokens" does not exist`; nothing is changed in that case, just run `setup.sql`.
3. Set the env vars on your host (Vercel etc.):
   ```
   SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...        # Settings -> API Keys. Server-side only.
   CRON_SECRET=some-long-random-string
   NEXT_PUBLIC_SITE_URL=https://your-domain
   ```
4. Optional, for peaks/lows while nobody is browsing: run `supabase/cron.sql` (pg_cron + pg_net call
   `/api/cron/refresh` every minute).

### Wallet accounts (optional)

Connect a Solana (Phantom, Solflare, Backpack) or Ethereum (MetaMask, Rabby…) wallet to sync "My calls" across
devices and appear on the **caller leaderboard** (Leaderboard → Callers).

1. Supabase dashboard → **Authentication → Sign In / Providers → Web3 Wallet**: enable Solana and/or Ethereum.
2. **Authentication → URL Configuration**: set the Site URL to your domain and add `http://localhost:3000` to the
   redirect URLs for local dev (the signed message names the page's domain).
3. Add the public keys to the app env:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # Settings -> API Keys
   ```

How calls work:

- Signing in only signs a message. No transaction, no fees.
- A **call** is the price at the moment *you* paste a token while connected, taken from the server's market
  data. The first call per token counts; calls can be deleted but never edited (enforced by the database).
- Calls saved on a device before connecting stay on that device (marked "device") and are **not** uploaded,
  because their entry came from the browser and could be faked. Only server-recorded calls count on the board.
- The caller board ranks wallets by 2x hits, average x (3+ calls), best call and number of calls, each call
  measured from the caller's own entry.

Without `SUPABASE_URL` / `SUPABASE_SECRET_KEY` Rankr uses `./data/rankr.json`. `RANKR_MOCK=1` always uses the
file store, so demo data never reaches a real database.

`supabase/smoke-test.sql` checks the schema (sealed entry, atomic pastes, sorting, stats, privileges) and
rolls everything back. Run it against a local or throwaway database:
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/smoke-test.sql`.

### API

| Route | What |
| --- | --- |
| `POST /api/track` `{input}` | paste a CA / link |
| `GET /api/tokens?sort=top\|peak\|losers\|new\|hot&range=24h\|7d\|30d\|all&chain=&q=&ids=&limit=&offset=` | leaderboard page |
| `GET /api/tokens/:chain/:address` | one token (or a preview if untracked) |
| `GET /api/stats` | totals for the home page |
| `GET /api/cron/refresh` | refresh the stalest tokens (needs `CRON_SECRET`) |
| `GET /api/callers?sort=hits\|avg\|best\|calls&limit=&offset=` | caller leaderboard |
| `GET /api/me`, `GET/DELETE /api/me/calls` | the signed-in wallet and its calls (`Authorization: Bearer <access token>`) |

## How the numbers work

- **Entry**: price and market cap of the most liquid pair at the first paste. Sealed: the app never rewrites
  it and the database rejects changes.
- **x = price now / entry price.** 2x = doubled, 10x = ten times the entry. A fresh paste is 1.00x.
  Losses are shown as a percentage (-37%).
- **Peak / low**: the highest / lowest price seen since the paste, updated on every refresh (on page views
  for the tokens on screen, and by the cron job for the rest). Sampled, so a wick between refreshes can be
  missed.
- **Pair migration** (e.g. pump.fun bonding curve → PumpSwap/Raydium) is handled because the best pair is
  re-picked on every refresh.

## Project layout

```
src/app/                     pages, API routes, icons, social cards
  api/track                  POST { input } -> records a paste
  api/tokens                 GET a leaderboard page (sort, filter, paging)
  api/stats                  GET home page totals
  api/cron/refresh           background price refresh
  api/callers, api/me/*      caller board, signed-in wallet and its calls
  api/tokens/[chain]/[addr]  GET one token (or a preview if untracked)
src/components/              UI (PasteBox, Leaderboard, TokenDetail, MyCalls, Logo...)
src/lib/                     address parsing, DexScreener client, metrics, formatting
src/lib/store/               storage: file (local) and Supabase adapters, shared query rules
src/lib/accounts.ts          wallet sessions (Supabase Auth) and calls, server side
supabase/                    migrations, setup.sql (all of them in one file), smoke test, optional cron job
```

Not financial advice. Memecoins can and do go to zero.
