-- Default names. Every new account (a one-click guest or an email sign-in) starts with a name derived from
-- sha256(user id), in the style of the logo: a crypto word + hex from the same digest, e.g. nonce_7f3a.
-- It can be changed any time with rankr_set_username.

do $$
begin
  if to_regprocedure('public.rankr_set_username(uuid, text)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

-- The first hex digit picks the word, the next `p_hex` digits follow it.
create or replace function public.rankr_default_username(p_user uuid, p_hex integer default 4) returns text
language sql immutable as $$
  select (array['nonce', 'cipher', 'hash', 'salt', 'merkle', 'ledger', 'block', 'shard',
                'vault', 'epoch', 'proof', 'oracle', 'genesis', 'keccak', 'satoshi', 'entropy'])
           [1 + ('x' || left(h, 1))::bit(4)::int]
         || '_' || substr(h, 2, least(greatest(p_hex, 4), 12))
  from (select encode(sha256(convert_to(p_user::text, 'UTF8')), 'hex') as h) d;
$$;

-- The user's username, creating the profile with the default name on first sight. If someone already
-- took that name, more hex digits are used.
create or replace function public.rankr_ensure_profile(p_user uuid) returns text
language plpgsql as $$
declare
  v_name text;
  v_hex integer;
begin
  select username into v_name from public.profiles where user_id = p_user;
  if v_name is not null then
    return v_name;
  end if;
  foreach v_hex in array array[4, 6, 8, 12] loop
    begin
      insert into public.profiles (user_id, username)
      values (p_user, public.rankr_default_username(p_user, v_hex))
      returning username into v_name;
      return v_name;
    exception when unique_violation then
      -- Either the name is taken or a parallel request just created this user's profile.
      select username into v_name from public.profiles where user_id = p_user;
      if v_name is not null then
        return v_name;
      end if;
    end;
  end loop;
  raise exception 'rankr: no free default name for %', p_user;
end $$;

revoke all on function public.rankr_ensure_profile(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_ensure_profile(uuid) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_ensure_profile(uuid) to service_role;
  end if;
end $$;
