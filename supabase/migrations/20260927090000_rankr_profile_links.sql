-- Profiles grow a short bio and links (X, Telegram, a site, a trading bot referral...), shown on the caller's
-- public page, each ready to copy. Written by the server only (rankr_set_profile), like the name, and public
-- like the rest of the profile. The same limits as src/lib/profile.ts, which also cleans them first.

do $$
begin
  if to_regprocedure('public.rankr_set_official(text,text,boolean)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists links jsonb not null default '[]'::jsonb;

-- What's wrong with a bio and links, or null. Links are an array of up to 8 {label, url}: the label up to 32
-- characters (it may be empty), the url an http(s) link of up to 200 with no spaces and no user@ part.
create or replace function public.rankr_profile_problem(p_bio text, p_links jsonb) returns text
language sql immutable as $$
  select case
    when p_bio is null or char_length(p_bio) > 160 then 'bio_long'
    when p_links is null or jsonb_typeof(p_links) <> 'array' then 'invalid'
    when jsonb_array_length(p_links) > 8 then 'too_many'
    else (
      select x.problem
      from (
        select e.i, case
          when jsonb_typeof(e.l) <> 'object' then 'invalid'
          when jsonb_typeof(e.l->'label') is distinct from 'string'
            or jsonb_typeof(e.l->'url') is distinct from 'string'
            or e.l - 'label' - 'url' <> '{}'::jsonb then 'invalid'
          when char_length(e.l->>'label') > 32 then 'label_long'
          when char_length(e.l->>'url') > 200
            or e.l->>'url' !~ '^https?://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$' then 'bad_url'
        end as problem
        from jsonb_array_elements(p_links) with ordinality as e(l, i)
      ) x
      where x.problem is not null
      order by x.i
      limit 1
    )
  end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_links_valid') then
    alter table public.profiles add constraint profiles_bio_links_valid
      check (public.rankr_profile_problem(bio, links) is null);
  end if;
end $$;

-- Sets a user's bio and links. Returns {ok, bio, links} or
-- {ok: false, error: invalid | bio_long | too_many | label_long | bad_url | not_found}.
create or replace function public.rankr_set_profile(p_user uuid, p_bio text, p_links jsonb) returns jsonb
language plpgsql as $$
declare
  v_problem text := public.rankr_profile_problem(p_bio, p_links);
begin
  if v_problem is not null then
    return jsonb_build_object('ok', false, 'error', v_problem);
  end if;
  update public.profiles set bio = p_bio, links = p_links where user_id = p_user;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'bio', p_bio, 'links', p_links);
end $$;

revoke all on function public.rankr_set_profile(uuid, text, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_set_profile(uuid, text, jsonb) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_set_profile(uuid, text, jsonb) to service_role;
  end if;
end $$;
