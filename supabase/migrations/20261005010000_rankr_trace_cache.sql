-- Trails read lately, shared: a wallet read by anyone (on any account's keys) is kept for a while, and anyone
-- opening it meanwhile gets it from here, spending no API budget and no free allowance (src/lib/trace/stored.ts).
-- Only public chain data. No policies: only the server (secret key) reads and writes it.

do $$
begin
  if to_regclass('public.rate_limits') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

create table if not exists public.trace_cache (
  key      text primary key,                  -- "<chain>:<address>", EVM addresses lowercased
  value    jsonb not null,                    -- the wallet's TraceResponse
  read_at  timestamptz not null default now()
);

alter table public.trace_cache enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.trace_cache from anon, authenticated;
  end if;
end $$;

-- Keeps a wallet's latest read; now and then, drops reads over a day old.
create or replace function public.rankr_cache_trace(p_key text, p_value jsonb) returns void
language plpgsql as $$
begin
  insert into public.trace_cache (key, value, read_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, read_at = excluded.read_at;
  if random() < 0.01 then
    delete from public.trace_cache where read_at < now() - interval '1 day';
  end if;
end $$;

revoke all on function public.rankr_cache_trace(text, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_cache_trace(text, jsonb) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_cache_trace(text, jsonb) to service_role;
  end if;
end $$;
