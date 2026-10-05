-- Trace on your own keys: every account that isn't official traces on API keys of its own (a Blockscout key for
-- the EVM chains, a Helius key for Solana), never on the site's. They're kept here encrypted by the server
-- (AES-256-GCM, src/lib/secret-box.ts), so the table alone never gives a key away. No policies: browsers get
-- nothing; only the server (secret key) reads and writes it, one account's own row at a time.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

create table if not exists public.trace_keys (
  user_id     uuid primary key references public.profiles (user_id) on delete cascade,
  blockscout  text,                           -- encrypted; null: none
  helius      text,                           -- encrypted; null: none
  updated_at  timestamptz not null default now()
);

alter table public.trace_keys enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.trace_keys from anon, authenticated;
  end if;
end $$;

-- Sets both of an account's keys (already encrypted; null clears one). With neither left, the row goes.
create or replace function public.rankr_set_trace_keys(p_user uuid, p_blockscout text, p_helius text) returns void
language plpgsql as $$
begin
  if p_blockscout is null and p_helius is null then
    delete from public.trace_keys where user_id = p_user;
    return;
  end if;
  insert into public.trace_keys (user_id, blockscout, helius, updated_at)
  values (p_user, p_blockscout, p_helius, now())
  on conflict (user_id) do update set
    blockscout = excluded.blockscout,
    helius     = excluded.helius,
    updated_at = excluded.updated_at;
end $$;

revoke all on function public.rankr_set_trace_keys(uuid, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_set_trace_keys(uuid, text, text) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_set_trace_keys(uuid, text, text) to service_role;
  end if;
end $$;
