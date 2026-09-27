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
- **Accounts**: pasting needs an account, so every call on Rankr has a name behind it. Continue as a
  **guest** in one click; save a **key** (`rk-7F3A-K9QX-2MPD-W8HT-ZC4N`) any time to sign in on any device.
  No email, no password. Every account starts with a name derived from `sha256(user id)`, like `@nonce_7f3a`,
  and can rename itself.
- **My calls**: every token you pasted, measured from *your* paste.
- **Caller leaderboard**: callers ranked by their calls (2x hits, average x, best call), by username. Each
  caller has a public profile at `/u/<username>` with their numbers and every call.
- **Watchlist**: star a token on its page to follow it under My calls → Watchlist (kept in the browser).
- **Milestone alerts** (settings menu): a notification when one of your calls or a watched token reaches a
  new milestone (2x, 3x, 5x, 10x...), while Rankr is open. A token already past a milestone when first seen
  doesn't alert for it.
- **Official accounts**: a check badge next to the name (e.g. `@rankr`), given by the project owner only.
- **Token page**: big multiple, milestone ladder (2x → 1000x with target market caps), SHA-256 entry seal, stats,
  DexScreener chart, share to X / native share, and a generated social card per token.
- **Landing page** at `/`: kept short on purpose: the headline, a "Start tracking" link, three steps and a
  four-question FAQ. English only: Rankr is for DEX traders everywhere.
  The app itself (paste box + live board) is at **`/app`**.
- **Settings menu** (the gear in the header): theme, and the app: open it, install it, copy its link. It is the
  only place with app buttons, so pages stay clean.
- **Installable app (PWA)**: opens on `/app`, full screen, with shortcuts (track, leaderboard, my calls) and an
  offline page (next section).
- Responsive (bottom nav on mobile, table on desktop), dark and light theme.

## Design

Minimal, monochrome, cryptography-flavored. References: Vercel's Geist design system (monochrome, Swiss,
hairline borders), "decrypted text" reveal effects, and hash visualizations such as identicons / SSH randomart.

- **Logo**: the letter "r" on a 5x5 matrix. The other 18 cells come from `SHA-256("rankr")`
  (`fa7f36c0…4e3a`): cell *i* gets a dot when bit pair *i* of the digest is `11`. The mark is literally the
  name's hash, so no other name produces it. `src/lib/logo.test.ts` recomputes the digest and checks the favicon.
- **Entry seal**: every token gets `sha256(chain:address:entryPrice:firstPastedAt)`, shown on the token page and
  after a paste. Anyone can recompute it, so an edited entry would no longer match.
- **UI**: black / white / grays, color only for P&L (green up, red down). No token icons: tokens are shown as
  ticker + name. A multiple that moves on a live refresh flashes green or red. Geist Sans for text, Geist Mono for numbers, addresses and hashes. The hero headline and the
  big multiple "decrypt" out of random hex on first load (skipped with reduced motion).
- Colors live as CSS variables in `src/app/globals.css` (dark and light).

## Install as an app (PWA)

The web app manifest (`src/app/manifest.ts`) has `id` and `start_url` `/app` with `scope` `/`, so the installed
app skips the landing page and every page of the site opens inside it. The app link is `https://your-domain/app`.

- **Install app** in the settings menu (`src/components/SettingsMenu.tsx`, `src/lib/pwa.ts`): Chrome, Edge and
  Android show the browser's own install dialog (`beforeinstallprompt`); iPhone and iPad get the Share → Add to
  Home Screen step; other browsers get their menu step. Once installed it reads "Installed on this device".
- **Service worker** (`public/sw.js`, registered in production only): pages and API calls always go to the network
  (prices are live), with navigation preload; when the network is gone it shows `public/offline.html` and reloads
  once back online. It is served with `Cache-Control: no-cache` (`next.config.ts`) so updates reach installed apps.
- iOS: `apple-mobile-web-app` meta and `apple-icon.png`; headers pad for the notch (`env(safe-area-inset-top)`).
  The status bar is `black-translucent` (white text over the page), so in the light theme the installed app keeps
  a dark strip under it.
- `theme-color` (status bar, app title bar, Safari toolbar) and the offline page follow the theme picked in
  Rankr, not the system's light / dark setting.
- Opened as the installed app, `/` forwards to `/app`, and the app's footer hides the landing links.
- Installability needs HTTPS (localhost is fine for testing).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · SWR. Market data from the public
[DexScreener API](https://docs.dexscreener.com/api/reference) (no key needed).

## Run it

```bash
npm install
npm run dev          # http://localhost:3000 (landing) and /app (the app), live DexScreener data
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
- Supabase Auth handles accounts (anonymous guests with a sign-in key), and each caller's calls are rows tied
  to their account.

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
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # Settings -> API Keys, public
   ```
4. Turn on guests and keys in Supabase Auth (next section).
5. Optional, for peaks/lows while nobody is browsing: run `supabase/cron.sql` (pg_cron + pg_net call
   `/api/cron/refresh` every minute).

### Accounts (guest + key)

Pasting needs an account. Someone signed out who pastes a CA goes to `/login`:

- **Continue as guest**: one click. A Supabase anonymous account that lives in that browser.
- **Sign in with key**: paste a key saved earlier.

Either way they land back in the app (`/app`) and the CA they pasted is tracked. Browsing needs no account.

A guest saves a key on `/account` (the header avatar, the account menu, "My calls" and the paste result all
point there until one is saved). The key is shown once, with copy and download, next to a 5x5 dot pattern from
its hash; the same pattern shows up when the key is pasted to sign in, so the two can be matched at a glance.
The same page makes a new key: the old one stops working and other devices are signed out.

In the Supabase dashboard (no SMTP, email templates or redirect URLs needed):

1. **Authentication → Sign In / Providers**: turn on **Allow anonymous sign-ins** (guests) and keep
   **Email** enabled with **Confirm email** on. Keys sign in through the Email provider; with confirmation on,
   nobody can make an account by signing up with an email directly.
2. Optional, against guest spam: **Authentication → Attack Protection → CAPTCHA** (Supabase caps anonymous
   sign-ins at 30 per hour per IP by default, adjustable under Rate Limits).

How it works:

- A **call** is the price at the moment *you* paste a token, taken from the server's market data. The first
  call per token counts; calls can be deleted but never edited (enforced by the database).
- **Names**: every new account gets a default name from `sha256(user id)`: the first hex digit picks a
  word (`nonce`, `cipher`, `merkle`, `ledger`, `satoshi`, ...), the next 4 digits follow it (`@nonce_7f3a`;
  more digits if that one is taken). Renaming on `/account`: 3-20 letters, numbers or underscores, unique
  ignoring case, a few names reserved (and look-alikes: anything starting with `rankr` or containing
  `official`). Calls follow the account, not the name. Profiles hold only the name and the official flag:
  no email, no wallet.
- **Guests** exist only in the browser that created them; clearing site data loses access (their calls
  stay on the board). Signing out without a key asks for confirmation first.
- **Keys** (`src/lib/key.ts`): `rk-` and 20 Crockford base32 characters, 100 random bits, forgiving about
  case, dashes and O/0, I/L/1 when pasted. In Supabase Auth a key is an email + password: the email is made up
  from the key (`<sha256 of the key, 32 hex>@key.rankr.invalid`, a domain that can never receive mail) and the
  password is the key itself, so the key alone finds and opens the account. `POST /api/me/key` generates the
  key on the server and sets both on the user with the Admin API, already confirmed, so nothing is ever sent;
  the user id stays, so the name and calls stay. Supabase stores only a bcrypt hash of the password and Rankr
  never stores the key; a lost key can't be recovered. Rankr tells keyed accounts apart by that email, not by
  Supabase's `is_anonymous` flag, so if you ever clean up old guests, only delete users with no email.
- **Official accounts** (next section) show a check badge wherever the name appears.
- Accounts made with an email link before keys count as guests: they stay signed in where they are and can
  save a key (which replaces the email). Their email is never sent to the browser.
- `/api/track` checks the access token with Supabase Auth and refuses pastes without an account (401); the UI
  sends people to `/login` and back with their CA.
- The caller board ranks callers by 2x hits, average x (3+ calls), best call and number of calls.
- Without the `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_*` vars (local dev), there are no accounts: pasting works
  for everyone and "My calls" is kept in the browser.

### Official accounts

An official account has a check badge next to its name on the caller board, in the header and on its
account page. Only the project owner can give it, from the Supabase **SQL Editor**; there is no button for it
in the app. To set up `@rankr`:

1. In Rankr, continue as a guest and **save the key** on `/account` (without a key the account lives in one
   browser only). Note its name, e.g. `@nonce_7f3a`.
2. In the SQL Editor:
   ```sql
   select rankr_set_official('nonce_7f3a', p_rename => 'rankr');  -- badge on, renamed to @rankr
   ```
   Returns `{"ok": true, ...}`, or `{"ok": false, "error": "not_found" | "invalid" | "taken"}`. It shows up
   within a minute. Without `p_rename` the account keeps its name. The new name may be a reserved one.

To take the badge away: `select rankr_set_official('rankr', p_official => false);`

An official account's name is locked (only `rankr_set_official` changes it), so the badge always vouches for
the same name. Names starting with `rankr` or containing `official` are reserved for everyone else, so nobody
can pass for the project without the badge. The function can't be called from the browser (service role only).

`supabase/smoke-test.sql` checks the schema (sealed entry, atomic pastes, sorting, stats, privileges) and
rolls everything back. Run it against a local or throwaway database:
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/smoke-test.sql`.

### API

| Route | What |
| --- | --- |
| `POST /api/track` `{input}` | paste a CA / link (needs an account when accounts are on) |
| `GET /api/tokens?sort=top\|peak\|losers\|new\|hot&range=24h\|7d\|30d\|all&chain=&q=&ids=&limit=&offset=` | leaderboard page |
| `GET /api/tokens/:chain/:address` | one token (or a preview if untracked) |
| `GET /api/stats` | totals for the home page |
| `GET /api/cron/refresh` | refresh the stalest tokens (needs `CRON_SECRET`) |
| `GET /api/callers?sort=hits\|avg\|best\|calls&limit=&offset=` | caller leaderboard |
| `GET /api/callers/:username` | a caller's profile: board numbers and calls |
| `GET /api/me`, `POST /api/me/username` `{username}`, `POST /api/me/key`, `GET/DELETE /api/me/calls` | your account, username, a new sign-in key (returned once) and calls (`Authorization: Bearer <access token>`) |
| `GET /api/username?name=` | is a username free |

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
src/app/                     pages, API routes, icons, manifest, social cards
  (site)/                    the landing page at / (own header and footer)
  (app)/                     the app shell (header, bottom nav) and its pages: app (/app), leaderboard, me, t/..., u/...
  api/track                  POST { input } -> records a paste
  api/tokens                 GET a leaderboard page (sort, filter, paging)
  api/stats                  GET home page totals
  api/cron/refresh           background price refresh
  api/callers, api/me/*      caller board, your account, username and calls
  login, account             guest / key sign-in, save or replace a key, rename
  api/tokens/[chain]/[addr]  GET one token (or a preview if untracked)
src/components/              UI (PasteBox, Leaderboard, TokenDetail, MyCalls, Logo, Landing, SettingsMenu...)
src/lib/                     address parsing, DexScreener client, metrics, formatting
src/lib/store/               storage: file (local) and Supabase adapters, shared query rules
src/lib/accounts.ts          accounts (Supabase Auth: guests, keys), names and calls, server side
src/lib/key.ts               sign-in keys: generate, parse, the key's email, the dot pattern
src/lib/username.ts          username rules (reserved names, look-alikes), same as the SQL
src/lib/pwa.ts               install state: the browser's install prompt, iOS, installed
src/lib/watchlist.ts         the watchlist (starred tokens, kept in the browser)
src/lib/alerts.ts            milestone alerts: which milestones are new, notifications
src/lib/caller-stats.ts      a caller's numbers from their calls (same rules as the caller board)
public/sw.js, offline.html   service worker and the offline page
supabase/                    migrations, setup.sql (all of them in one file), smoke test, optional cron job
```

Not financial advice. Memecoins can and do go to zero.
