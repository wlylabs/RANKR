-- Caller profiles beyond the name: a short bio, an X account and a Telegram username (same rules as
-- src/lib/profile.ts). The X account shows on the public profile only once verified: the server has read
-- a public post from that X account carrying the code for this Rankr account (rankr_verify_x).
-- One Rankr account per verified X account; the newest verification wins.

do $$
begin
  if to_regprocedure('public.rankr_set_official(text, text, boolean)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists x_handle text;
alter table public.profiles add column if not exists x_verified_at timestamptz;
alter table public.profiles add column if not exists telegram text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length') then
    alter table public.profiles add constraint profiles_bio_length check (char_length(bio) between 1 and 160);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_x_handle_format') then
    alter table public.profiles add constraint profiles_x_handle_format check (x_handle ~ '^[A-Za-z0-9_]{1,15}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_telegram_format') then
    alter table public.profiles add constraint profiles_telegram_format check (telegram ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_x_verified_has_handle') then
    alter table public.profiles add constraint profiles_x_verified_has_handle check (x_verified_at is null or x_handle is not null);
  end if;
end $$;

create unique index if not exists profiles_x_verified_key on public.profiles (lower(x_handle)) where x_verified_at is not null;

-- Sets the bio, X account and Telegram username (null or '' clears one). A different X account starts
-- unverified; the same one in another case stays verified.
-- Returns {ok, bio, x, x_verified, telegram} or {ok: false, error: not_found | invalid}.
create or replace function public.rankr_set_profile(p_user uuid, p_bio text, p_x text, p_telegram text) returns jsonb
language plpgsql as $$
declare
  v public.profiles;
begin
  update public.profiles
     set bio = nullif(btrim(p_bio), ''),
         x_verified_at = case when lower(x_handle) = lower(nullif(p_x, '')) then x_verified_at end,
         x_handle = nullif(p_x, ''),
         telegram = nullif(p_telegram, '')
   where user_id = p_user
  returning * into v;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'bio', v.bio, 'x', v.x_handle, 'x_verified', v.x_verified_at is not null,
                            'telegram', v.telegram);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

-- Marks the account's X account (p_x, any case) verified, once the server has read the post. Another
-- account verified as the same X account loses it. {ok: false, error: changed} if the account's X account
-- is no longer p_x.
create or replace function public.rankr_verify_x(p_user uuid, p_x text) returns jsonb
language plpgsql as $$
begin
  if not exists (select 1 from public.profiles where user_id = p_user and lower(x_handle) = lower(p_x)) then
    return jsonb_build_object('ok', false, 'error', 'changed');
  end if;
  update public.profiles set x_verified_at = null
   where lower(x_handle) = lower(p_x) and x_verified_at is not null and user_id <> p_user;
  update public.profiles set x_verified_at = coalesce(x_verified_at, now()) where user_id = p_user;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.rankr_set_profile(uuid, text, text, text) from public;
revoke all on function public.rankr_verify_x(uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_set_profile(uuid, text, text, text) from anon, authenticated;
    revoke all on function public.rankr_verify_x(uuid, text) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_set_profile(uuid, text, text, text) to service_role;
    grant execute on function public.rankr_verify_x(uuid, text) to service_role;
  end if;
end $$;
