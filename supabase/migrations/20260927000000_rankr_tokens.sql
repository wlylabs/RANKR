-- Rankr schema: one row per token, entry sealed at the first paste.
--
-- The web app talks to this through the RPC functions below using the secret (service role) key,
-- from the server only. Browsers never write; public reads are allowed by RLS.

create table if not exists public.tokens (
  id               text primary key,                 -- "<chain>:<address>", EVM addresses lowercased
  chain_id         text not null,
  address          text not null,
  name             text not null,
  symbol           text not null,
  image_url        text,

  -- Sealed entry: set once by the first paste, never updated (see rankr_lock_entry).
  entry_price_usd  double precision not null check (entry_price_usd > 0),
  entry_market_cap double precision,
  first_pasted_at  timestamptz not null,

  last_pasted_at   timestamptz not null,
  paste_count      integer not null default 1 check (paste_count > 0),

  peak_price_usd   double precision not null,
  peak_at          timestamptz not null,
  low_price_usd    double precision not null,
  low_at           timestamptz not null,

  last_price_usd   double precision not null check (last_price_usd > 0),
  market           jsonb,                            -- latest DexScreener snapshot
  last_checked_at  timestamptz not null,

  -- Price now / entry price: 2 = 2x (doubled), 0.5 = -50%.
  multiple         double precision generated always as (last_price_usd / entry_price_usd) stored,
  peak_multiple    double precision generated always as (peak_price_usd / entry_price_usd) stored
);

create index if not exists tokens_multiple_idx        on public.tokens (multiple desc);
create index if not exists tokens_peak_multiple_idx   on public.tokens (peak_multiple desc);
create index if not exists tokens_first_pasted_at_idx on public.tokens (first_pasted_at desc);
create index if not exists tokens_paste_count_idx     on public.tokens (paste_count desc, last_pasted_at desc);
create index if not exists tokens_last_checked_at_idx on public.tokens (last_checked_at);
create index if not exists tokens_chain_idx           on public.tokens (chain_id);

-- "No backdating", enforced by the database: the entry of a token can never change.
create or replace function public.rankr_lock_entry() returns trigger
language plpgsql as $$
begin
  if new.id is distinct from old.id
     or new.chain_id is distinct from old.chain_id
     or new.address is distinct from old.address
     or new.entry_price_usd is distinct from old.entry_price_usd
     or new.entry_market_cap is distinct from old.entry_market_cap
     or new.first_pasted_at is distinct from old.first_pasted_at then
    raise exception 'rankr: the entry of % is sealed and cannot change', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists tokens_lock_entry on public.tokens;
create trigger tokens_lock_entry
  before update on public.tokens
  for each row execute function public.rankr_lock_entry();

-- Public read, no public write.
alter table public.tokens enable row level security;
drop policy if exists "tokens are public" on public.tokens;
create policy "tokens are public" on public.tokens for select to anon, authenticated using (true);

-- A paste: insert the token with its entry, or, if it is already tracked, bump the paste
-- counter and fold in the fresh market data. Atomic, so simultaneous pastes can't lose counts.
-- `p` is a tokens row as JSON (snake_case). Returns {created, record}.
create or replace function public.rankr_record_paste(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_created boolean;
  v_row jsonb;
begin
  insert into public.tokens as t (
    id, chain_id, address, name, symbol, image_url,
    entry_price_usd, entry_market_cap, first_pasted_at, last_pasted_at, paste_count,
    peak_price_usd, peak_at, low_price_usd, low_at,
    last_price_usd, market, last_checked_at
  )
  select
    r.id, r.chain_id, r.address, r.name, r.symbol, r.image_url,
    r.entry_price_usd, r.entry_market_cap, r.first_pasted_at, r.last_pasted_at, 1,
    r.peak_price_usd, r.peak_at, r.low_price_usd, r.low_at,
    r.last_price_usd, r.market, r.last_checked_at
  from jsonb_populate_record(null::public.tokens, p) as r
  on conflict (id) do update set
    paste_count     = t.paste_count + 1,
    last_pasted_at  = excluded.last_pasted_at,
    name            = coalesce(nullif(excluded.name, ''), t.name),
    symbol          = coalesce(nullif(excluded.symbol, ''), t.symbol),
    image_url       = coalesce(excluded.image_url, t.image_url),
    market          = excluded.market,
    last_price_usd  = excluded.last_price_usd,
    last_checked_at = excluded.last_checked_at,
    peak_at         = case when excluded.last_price_usd > t.peak_price_usd then excluded.last_checked_at else t.peak_at end,
    peak_price_usd  = greatest(t.peak_price_usd, excluded.last_price_usd),
    low_at          = case when excluded.last_price_usd < t.low_price_usd then excluded.last_checked_at else t.low_at end,
    low_price_usd   = least(t.low_price_usd, excluded.last_price_usd)
  returning (t.xmax = 0), to_jsonb(t) into v_created, v_row;

  return jsonb_build_object('created', v_created, 'record', v_row);
end $$;

-- Market refresh for many tokens. Only touches market fields; peak/low only move outward.
-- `updates` is [{id, name, symbol, image_url, market, last_price_usd, checked_at}]. Returns rows updated.
create or replace function public.rankr_apply_market(updates jsonb) returns integer
language plpgsql as $$
declare
  v_count integer;
begin
  update public.tokens t set
    name            = coalesce(nullif(u.name, ''), t.name),
    symbol          = coalesce(nullif(u.symbol, ''), t.symbol),
    image_url       = coalesce(u.image_url, t.image_url),
    market          = u.market,
    last_price_usd  = u.last_price_usd,
    last_checked_at = u.checked_at,
    peak_at         = case when u.last_price_usd > t.peak_price_usd then u.checked_at else t.peak_at end,
    peak_price_usd  = greatest(t.peak_price_usd, u.last_price_usd),
    low_at          = case when u.last_price_usd < t.low_price_usd then u.checked_at else t.low_at end,
    low_price_usd   = least(t.low_price_usd, u.last_price_usd)
  from jsonb_to_recordset(updates) as u(
    id text, name text, symbol text, image_url text, market jsonb, last_price_usd double precision, checked_at timestamptz
  )
  where t.id = u.id and u.last_price_usd > 0;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Leaderboard page. sort: top | peak | losers | new | hot. Returns {total, records}.
create or replace function public.rankr_query(
  p_sort   text default 'top',
  p_chain  text default null,
  p_since  timestamptz default null,
  p_q      text default null,
  p_ids    text[] default null,
  p_limit  integer default 50,
  p_offset integer default 0
) returns jsonb
language sql stable as $$
  with f as (
    select t.* from public.tokens t
    where (p_chain is null or t.chain_id = p_chain)
      and (p_since is null or t.first_pasted_at >= p_since)
      and (p_ids is null or t.id = any (p_ids))
      and (
        p_q is null
        or t.symbol ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or t.name   ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or lower(t.address) = lower(p_q)
      )
  ),
  ranked as (
    select f.*, row_number() over (
      order by
        case when p_sort = 'top'    then f.multiple end desc nulls last,
        case when p_sort = 'peak'   then f.peak_multiple end desc nulls last,
        case when p_sort = 'losers' then f.multiple end asc nulls last,
        case when p_sort = 'hot'    then f.paste_count end desc nulls last,
        case when p_sort = 'hot'    then f.last_pasted_at end desc nulls last,
        f.first_pasted_at desc,
        f.id
    ) as rn
    from f
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'records', coalesce(
      (select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
         from ranked r
        where r.rn > greatest(p_offset, 0) and r.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 200)),
      '[]'::jsonb)
  );
$$;

-- Numbers for the home page.
create or replace function public.rankr_stats() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'total',   (select count(*) from public.tokens),
    'doubled', (select count(*) from public.tokens where peak_multiple >= 2),
    'in_red',  (select count(*) from public.tokens where multiple < 1),
    'best',    (select to_jsonb(t) from public.tokens t order by peak_multiple desc nulls last limit 1),
    'chains',  coalesce((select jsonb_agg(c order by c) from (select distinct chain_id as c from public.tokens) s), '[]'::jsonb)
  );
$$;

-- Writes are server-only (secret key). Reads may be called by anyone.
revoke all on function public.rankr_record_paste(jsonb) from public;
revoke all on function public.rankr_apply_market(jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_record_paste(jsonb) from anon, authenticated;
    revoke all on function public.rankr_apply_market(jsonb) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_record_paste(jsonb) to service_role;
    grant execute on function public.rankr_apply_market(jsonb) to service_role;
  end if;
end $$;
