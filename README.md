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
- **My calls**: every token you pasted, measured from *your* paste (saved in your browser).
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

## Storage

| Setup | What to set | Where data lives |
| --- | --- | --- |
| Local / VPS / Docker | nothing | `./data/rankr.json` (change with `RANKR_DATA_DIR`) |
| Vercel / serverless | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or Vercel KV's `KV_REST_API_URL` + `KV_REST_API_TOKEN`) | one Redis hash, `rankr:tokens` |

Serverless file systems are not persistent, so use Redis there. Set `NEXT_PUBLIC_SITE_URL` to your domain so share
links and social cards use absolute URLs. See `.env.example`.

## How the numbers work

- **Entry**: price and market cap of the most liquid pair at the first paste.
- **Multiple**: `current price / entry price`. Price is used rather than market cap because supply is fixed for most
  memecoins and price is always present in the API; market cap is shown alongside.
- **Peak / low**: updated whenever Rankr refreshes the token (list and token views refresh anything older than 15s,
  in batches of 30 addresses per DexScreener call). They are sampled, so a wick between refreshes can be missed.
- **Pair migration** (e.g. pump.fun bonding curve → PumpSwap/Raydium) is handled because the best pair is re-picked
  on every refresh.

## Project layout

```
src/app/                     pages, API routes, icons, social cards
  api/track                  POST { input } -> records a paste
  api/tokens                 GET all tracked tokens (with live data)
  api/tokens/[chain]/[addr]  GET one token (or a preview if untracked)
src/components/              UI (PasteBox, Leaderboard, TokenDetail, MyCalls, Logo...)
src/lib/                     address parsing, DexScreener client, store, metrics, formatting
```

Not financial advice. Memecoins can and do go to zero.
