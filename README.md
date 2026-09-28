# rankr

**Paste a CA. Watch it rank.**

Rankr is a memecoin call tracker. Paste a token contract address (or a pump.fun / DexScreener / GMGN / Birdeye /
explorer link) and Rankr records the price and market cap at that exact moment. From then on it tracks the token live
and shows how far it has moved since the paste: 2x, 5x, 10x, 100x... or the drawdown (-45%, -90%).

## Features

- **Paste, then choose**: auto-detects the chain and picks the most liquid DEX pair via the DexScreener API.
  Pasting a valid CA looks it up right away and offers two choices: **Post call** (public, sealed at the price
  right now, under your name; needs an account) or **Save to watchlist** (private, on this device, not a call and
  not on the boards; no account needed).
- **Entry locked at the first paste**: later pastes of the same token keep the original entry and bump a paste counter.
- **Live multiple**: current price / entry price, shown as `3.42x` for gains and `-37.2%` for losses.
  Peak and lowest point since the paste are recorded too.
- **Leaderboard**: two boards, Tokens and Callers, each for **this month** (live, with the countdown to the reset) or
  **last month** (its kept top 10). Tokens: top gainers, peak x, biggest dumps, newest, most pasted. Filter by
  24h / 7d / the whole month, chain, and search.
  **Dead tokens** (down 70% or more from their first paste) are left off the boards so junk doesn't pile up; they're
  back if they recover, a search still finds them, and nothing is deleted: calls on them still count as losses on
  the caller board. The background refresh checks them hourly instead of every minute.
- **Monthly reset**: on the 1st of every month (00:00 UTC) every token and call is cleared and everyone starts from
  zero; the month's top 10 callers and tokens are kept under Leaderboard -> Last month (details below).
- **Accounts**: pasting needs an account, so every call on Rankr has a name behind it. Continue as a
  **guest** in one click; save a **key** (`rk-7F3A-K9QX-2MPD-W8HT-ZC4N`) any time to sign in on any device.
  No email, no password. Every account starts with a name derived from `sha256(user id)`, like `@nonce_7f3a`,
  and can rename itself.
- **You** (`/me`): your name, bio and links as on your public profile, your place on the caller board (and how
  far the caller one place up is), and three tabs: **Calls** (every token you pasted, measured from *your*
  paste), **Stats** (the charts of your public profile) and **Watchlist**. The tab is in the URL (`?tab=stats`).
- **Caller leaderboard**: callers ranked by hit rate (share of calls at 2x+), average x, 2x hits or best call. Signed
  in, your place stays pinned under the board: your rank and how far behind the caller one place up you are
  (or how many calls you still need to be ranked). Each caller has a public profile at `/u/<username>` with their
  numbers and every call.
- **Caller profiles**: an avatar drawn from the account (a mirrored 5x5 matrix from `sha256(user id)`, in the style
  of the logo, nothing to upload), a short bio, Telegram and website links, and an **X account, shown only once
  verified**: the caller posts a code from that X account and pastes the link (next sections). Edited on
  `/account`. Two small charts: where the calls are now (below entry, 1-2x, 2-5x, 5-10x, 10-100x, 100x+) and the
  last 10 calls (each up or down from its entry, how many are up, and the streak in profit up to the newest).
- **Feed** (`/feed`, and a live ticker under the header): every call as it lands ("@userx called $SHIB at
  $1.2B mc") and every call that reaches a milestone ("$PEPE hit 10x from @userx's call"), each from the caller's
  own entry, with the caller's hit rate once they have 5+ calls. Filter by everyone, top callers (the top 25 of
  the caller board) or **you** (your own calls and milestones), by calls or milestones, and by chain; the filters
  are in the URL (`/feed?scope=you&kind=milestone`). Grouped by day (Today, Yesterday, Sep 25...). Entries that
  land while you read wait behind an "N new" button instead of pushing the list down. The ticker shows the
  filter picked on the feed page.
- **News** (`/news`, in the nav): what's in the news right now, live, newest first, e.g. "Over 560,000 visitors
  flock to Busan to see canal-trapped shark Bukang-i". Just the headline (a link to the article), the publisher
  and how long ago; nothing has to be pasted first. Tabs **All · World · Viral · Crypto · Tech**
  (`/news?category=viral`); All takes the newest 25 of each, so the many crypto outlets don't bury the viral
  stories memes come from. From every free source, each story once, today's news only, at most 20 from any one
  source and 60 per tab; the page refreshes every 2 minutes. A search box searches them all (`/news?q=shark`).
  Sources (`src/lib/news-sources.ts`), with URLs taken from references rather than guessed:
  - no key, always on: Google News (US and Singapore top stories; World, Entertainment, Science and Technology;
    search), Bing News (search, newest first), GDELT (search), Hacker News (front page, search); world news RSS:
    BBC, The Guardian, Al Jazeera, NPR, Sky News, DW, CBC, Yonhap, The Korea Herald, Korea Times, CNA
    ([awesome-rss-feeds](https://github.com/plenaryapp/awesome-rss-feeds) and its PR #45,
    [rss-news-list](https://github.com/vandenbroucke/rss-news-list)); viral: UPI Odd News, New York Post;
    crypto: 35 news outlets (CoinDesk, The Block, Decrypt, Cointelegraph, Blockworks, Watcher Guru, ...), those
    [cryptocurrency.cv](https://github.com/nirholas/cryptocurrency.cv)'s feed health check keeps enabled;
  - free key, on once set (`.env.example`): GNews, NewsData.io, The Guardian API, NewsAPI.org, Currents,
    TheNewsAPI, each read as often as its free daily quota allows. Keys never show in logs.
  Not included: Reddit (needs an OAuth app), CryptoPanic (paid since 2026), Mediastack (free plan is HTTP only).
  Each headline has a **Tokens** button: every token named after the story. The names in the headline are the
  choices ("Bukang-i", "Busan"; the likeliest is picked: a quoted name, a run of capitalised words like "Moo
  Deng", then single ones), or type another. Tokens come from DexScreener's search (the name as written and run
  together: "Bukang-i", "Bukangi"), most liquid first, each with chain, address, age, market cap, 24h volume,
  liquidity, 24h transactions and 24h change, and Rankr's multiple for the ones it tracks. Many tokens share a
  name or a ticker, so the reader picks one (it opens its page on Rankr, to watch or call it). Dead tokens stay
  out: minimums for market cap, 24h volume, liquidity and 24h transactions (as DexScreener's and GMGN's
  screeners filter), $1K each by default and any number of transactions, set in the Tokens panel and kept in the
  browser for every story. A number the DEX doesn't give (a pump.fun token on its bonding curve has no
  liquidity) doesn't count against a token; the ones below the minimums can still be shown. With
  `RANKR_MOCK=1`, made-up stories.
- **Watchlist**: tokens saved from the paste box, or with Watch on a token page (also tokens Rankr doesn't track),
  under You → Watchlist, each measured from when you saved it. Kept in the browser; never a call.
- **Milestone alerts** (settings menu): a notification when one of your calls or a watched token reaches a
  new milestone (2x, 3x, 5x, 10x...), while Rankr is open. A token already past a milestone when first seen
  doesn't alert for it.
- **Official accounts**: a check badge next to the name (e.g. `@rankr`), given by the project owner only.
- **Token page**: big multiple, milestone ladder (2x → 1000x with target market caps), SHA-256 entry seal, stats,
  DexScreener chart, share to X / native share, and a generated social card per token.
- **Landing page** at `/`: kept short on purpose: the headline, a "Start tracking" button, three steps and a
  four-question FAQ. English only: Rankr is for DEX traders everywhere.
  The app itself is at **`/app`**.
- **Home** (`/app`): signed out, the headline and the paste box; signed in, the paste box and your place on the
  caller board (with your best call), without the headline. Then this month (the countdown to the reset and the
  board's totals) and three panels: top callers, top runners and the latest milestones.
- **Settings menu** (the gear in the header): theme (switching cross-fades the page), milestone alerts, About
  Rankr (the landing page) or Open app, Install app and the app link. It keeps pages free of app buttons.
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
- **Motion** (cinematic, `src/app/globals.css` + `src/components/Cinema.tsx`), with Material 3 easing
  (emphasized decelerate for arrivals) and everything off with reduced motion:
  - the landing hero opens like a title sequence: a dot-matrix "hash field" (lit cells from `SHA-256("rankr")`,
    breathing, framing the text), each line arriving out of a blur in turn, a light that follows the pointer,
    faint film grain; scrolling away, the hero drifts up and dims (scroll-driven, Chromium);
  - sections below arrive as they scroll into view;
  - app pages settle in on every navigation (`(app)/template.tsx`);
  - switching theme opens the new theme as a circle from the toggle (View Transitions).
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
6. For the monthly reset (next section), enable **pg_cron** (Database -> Extensions) and run `setup.sql` again, or
   the `rankr-monthly-reset` line of `supabase/cron.sql`.

### Accounts (guest + key)

Pasting needs an account. Someone signed out who pastes a CA goes to `/login`:

- **Continue as guest**: one click. A Supabase anonymous account that lives in that browser.
- **Sign in with key**: paste a key saved earlier.

Either way they land back in the app (`/app`) and the CA they pasted is tracked. Browsing needs no account.

A guest saves a key on `/account` (the header avatar, the account menu, "You" and the paste result all
point there until one is saved). The key is shown once, with copy and download, next to a 5x5 dot pattern from
its hash; the same pattern shows up when the key is pasted to sign in, so the two can be matched at a glance.
The same page makes a new key: the old one stops working and other devices are signed out.

In the Supabase dashboard (no SMTP, email templates or redirect URLs needed):

1. **Authentication → Sign In / Providers**: turn on **Allow anonymous sign-ins** (guests) and keep
   **Email** enabled with **Confirm email** on. Keys sign in through the Email provider; with confirmation on,
   nobody can make an account by signing up with an email directly.
2. Recommended, against bot accounts: CAPTCHA with Cloudflare Turnstile, set up as in **CAPTCHA** below
   (the app has to send the token, so turn it on in that order). Supabase also caps anonymous sign-ins at 30
   per hour per IP by default, adjustable under **Authentication → Rate Limits**.

### CAPTCHA (Cloudflare Turnstile)

"Continue as guest" and key sign-in send a Turnstile token when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set
(`src/lib/captcha.ts`). It is invisible for almost everyone: the widget only shows, at the bottom of the
screen, when Cloudflare wants a click. Supabase Auth checks the token with the secret key. Pasting, browsing
and everything else never see a captcha.

1. **Cloudflare dashboard → Turnstile → Add widget** (free; a Cloudflare account is enough, the domain
   doesn't have to be on Cloudflare). Name it "Rankr", add your hostname(s) (e.g. `rankr.example.com`, plus
   `localhost` for testing), widget mode **Managed** (or **Invisible**), pre-clearance **No**. Copy the
   **site key** and the **secret key**.
2. **Vercel → Project → Settings → Environment Variables**: add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = the site
   key (Production and Preview), then **redeploy** (a `NEXT_PUBLIC_` value is baked in at build time).
3. **Supabase → Authentication → Attack Protection → Enable CAPTCHA protection**: provider **Turnstile by
   Cloudflare**, paste the **secret key**, save.
4. Test in a private window: Continue as guest, sign out, sign in with a key. Both should work without any
   visible challenge. With a wrong secret, Rankr shows "Couldn't verify you're human".

Order matters: with CAPTCHA on in Supabase but no site key in the app, every sign-in is rejected. To turn it
off, do it the other way round (Supabase first, then remove the variable). For local testing, Cloudflare's
test site key `1x00000000000000000000AA` always passes (its secret is `1x0000000000000000000000000000000AA`).

### Limits

- **Pastes**: 20 a minute per IP, and per account 30 a day for a guest or 200 with a saved key (official
  accounts: none), in `PASTE_LIMITS` (`src/lib/params.ts`). Over the limit, `/api/track` answers 429 with a
  `Retry-After` header; a guest is told that saving a key raises the limit. The counters live in Postgres
  (`rate_limits` + `rankr_rate_hit`, fixed windows, shared by every server instance). Without Supabase, or
  if that call fails, an in-memory counter takes over, so the limiter itself never blocks a paste.
- **Caller board**: ranked by **hit rate** by default (the share of calls at 2x or more, among callers with
  5+ calls). Counting 2x calls alone would reward pasting every new token; that count is still a tab.

How it works:

- A **call** is the price at the moment *you* paste a token, taken from the server's market data. The first
  call per token counts; calls can't be edited or removed (enforced by the database): they all go with the
  monthly reset, and nobody can drop their losing calls to dress up their hit rate.
- **Names**: every new account gets a default name from `sha256(user id)`: the first hex digit picks a
  word (`nonce`, `cipher`, `merkle`, `ledger`, `satoshi`, ...), the next 4 digits follow it (`@nonce_7f3a`;
  more digits if that one is taken). Renaming on `/account`: 3-20 letters, numbers or underscores, unique
  ignoring case, a few names reserved (and look-alikes: anything starting with `rankr` or containing
  `official`). Calls follow the account, not the name. Profiles hold the name, the official flag, and the
  bio and links the caller adds (next section): no email, no wallet.
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
- The caller board ranks callers by hit rate (share of calls at 2x+, 5+ calls, the default), average x
  (5+ calls), 2x hits, best call and number of calls.
- Without the `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_*` vars (local dev), there are no accounts: pasting works
  for everyone and your calls ("You") are kept in the browser.

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

### Monthly reset

At **00:00 UTC on the 1st of every month** the boards start from zero: `rankr_end_month()` deletes every token,
and with it every call and milestone. Accounts stay (names, keys, bios, links, verified X accounts). Just before,
the month's **top 10 callers** (by hit rate, 5+ calls, as on the caller board) and **top 10 tokens** (by peak x
since the first paste, with who called each first) are kept in `public.seasons`, shown under Leaderboard ->
Last month. The leaderboard and "You" say when the next reset is.

It runs as a pg_cron job, `rankr-monthly-reset` (`0 0 1 * *`, pg_cron runs in UTC), which `setup.sql` schedules
when pg_cron is enabled. By hand: `select rankr_end_month();`. Stop it: `select cron.unschedule('rankr-monthly-reset');`.
The file store (local dev) doesn't reset.

### Caller profiles

On `/account` a caller can add (rules in `src/lib/profile.ts`, the same in SQL):

- a **bio**: up to 160 characters, one line;
- a **Telegram** username (5-32 letters, numbers or underscores), shown as a `t.me` link;
- a **website**: any http(s) link to a real domain, up to 200 characters (`example.com` becomes
  `https://example.com`), shown without the `https://`;
- an **X** username (up to 15 letters, numbers or underscores), shown on the profile **only once verified**, so
  nobody can pass for someone else's X account. To verify, the caller posts a short text from that X account
  with a code (`rankr-` and 10 hex digits of `sha256(user id + X username)`, so a post proves the X account for
  this Rankr account only), then pastes the link to the post. The server reads the post, checks its author and
  the code, and marks the X account verified (`rankr_verify_x`); the post can be deleted afterwards. Changing
  the X username starts over. One Rankr account per verified X account: verifying it again from another account
  moves it there. Up to 10 tries an hour per account.

The server reads the post through X's public embed endpoint (`publish.twitter.com/oembed`), which needs no key.
With `X_BEARER_TOKEN` set (an X API app's bearer token), it uses the X API (`GET /2/tweets/:id`) instead.

`supabase/smoke-test.sql` checks the schema (sealed entry, atomic pastes, sorting, stats, privileges) and
rolls everything back. Run it against a local or throwaway database:
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/smoke-test.sql`.

### API

| Route | What |
| --- | --- |
| `POST /api/track` `{input}` | paste a CA / link (needs an account when accounts are on) |
| `GET /api/tokens?sort=top\|peak\|losers\|new\|hot&range=24h\|7d\|all&chain=&q=&ids=&limit=&offset=` | leaderboard page (without dead tokens, unless `q` or `ids`) |
| `GET /api/season` | the last month that ended: its top 10 callers and tokens |
| `GET /api/lookup?input=` | what a paste points at, before choosing: live data, and Rankr's record if any (writes nothing) |
| `GET /api/watchlist?ids=<chain>:<address>,...` | live data for watched tokens, tracked or not |
| `GET /api/tokens/:chain/:address` | one token (or a preview if untracked) |
| `GET /api/stats` | totals for the home page |
| `GET /api/cron/refresh` | refresh the stalest tokens (needs `CRON_SECRET`) |
| `GET /api/callers?sort=rate\|avg\|hits\|best\|calls&limit=&offset=` | caller leaderboard |
| `GET /api/callers/:username` | a caller's profile: board numbers, bio and links, and calls |
| `GET /api/me`, `POST /api/me/username` `{username}`, `POST /api/me/key`, `GET /api/me/calls` | your account, username, a new sign-in key (returned once) and calls (`Authorization: Bearer <access token>`) |
| `GET /api/me/rank?sort=rate\|avg\|hits\|best\|calls` | your place on the caller board: rank, your numbers and the caller one place up |
| `POST /api/me/profile` `{bio, x, telegram, website}`, `POST /api/me/x` `{url}` | your bio and links (`""` clears one), and verifying your X account from a link to your post |
| `GET /api/username?name=` | is a username free |
| `GET /api/news`, `GET /api/news?q=` | what's in the news right now, or a search, newest first, each with the names a token would be called |
| `GET /api/news/tokens?q=` | every token named after a name from a story, most liquid first, with market data and Rankr's multiple |
| `GET /api/feed?scope=all\|top\|you&kind=all\|call\|milestone&chain=&limit=&offset=` | the feed: calls and milestones, newest first (`you`: yours, with `Authorization: Bearer <access token>`) |

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
  (app)/                     the app shell (header, bottom nav) and its pages: app (/app), feed, leaderboard, me, t/..., u/...
  api/track                  POST { input } -> records a paste
  api/tokens                 GET a leaderboard page (sort, filter, paging)
  api/stats                  GET home page totals
  api/cron/refresh           background price refresh
  api/callers, api/me/*      caller board, your account, username, profile, calls and rank
  api/feed                   GET the feed: calls and milestones
  api/news, api/news/tokens  GET the live news, and the tokens named after a story
  login, account             guest / key sign-in, save or replace a key, rename
  api/tokens/[chain]/[addr]  GET one token (or a preview if untracked)
src/components/              UI (PasteBox, Leaderboard, TokenDetail, MyCalls, Logo, Landing, SettingsMenu...)
src/lib/                     address parsing, DexScreener client, metrics, formatting
src/lib/store/               storage: file (local) and Supabase adapters, shared query rules
src/lib/accounts.ts          accounts (Supabase Auth: guests, keys), names and calls, server side
src/lib/key.ts               sign-in keys: generate, parse, the key's email, the dot pattern
src/lib/username.ts          username rules (reserved names, look-alikes), same as the SQL
src/lib/profile.ts           bio, X, Telegram and website rules, the X verification code, same as the SQL
src/lib/x-post.ts            reads a public post on X (embed endpoint, or the X API), to verify an X account
src/lib/avatar.ts            a caller's avatar: a mirrored 5x5 matrix from sha256 of the user id
src/lib/sha256.ts            synchronous SHA-256 (avatars and codes, browser and server)
src/lib/pwa.ts               install state: the browser's install prompt, iOS, installed
src/lib/watchlist.ts         the watchlist (saved tokens with their price when saved, kept in the browser)
src/lib/feed-scope.ts        the feed filter, everyone, top callers or yours (kept in the browser)
src/lib/news.ts              news: the live headlines, the names in them, and their namesakes on DexScreener
src/lib/news-sources.ts      every free news source (RSS and JSON APIs, keyed ones when set), read and cached
src/lib/alerts.ts            milestone alerts: which milestones are new, notifications
src/lib/caller-stats.ts      a caller's numbers from their calls (same rules as the caller board), spread and recent form
src/lib/season.ts            the monthly reset: when the next one is, month names
public/sw.js, offline.html   service worker and the offline page
supabase/                    migrations, setup.sql (all of them in one file), smoke test, cron jobs (refresh, monthly reset)
```

Not financial advice. Memecoins can and do go to zero.
