-- Live call feed: the newest calls across every caller ("@userx called $SHIB at $1.2B mc"), shown as a
-- ticker under the app header. Read by the server only, like the rest.

do $$
begin
  if to_regprocedure('public.rankr_ensure_profile(uuid)') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

create index if not exists calls_called_at_idx on public.calls (called_at desc);

-- The newest `p_limit` calls (at most 50), each with its caller's name and its token.
create or replace function public.rankr_recent_calls(p_limit integer default 20) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(
           to_jsonb(r.c) || jsonb_build_object('username', r.username, 'official', r.official, 'token', to_jsonb(r.t))
           order by (r.c).called_at desc),
         '[]'::jsonb)
  from (
    select c, t, p.username, p.official
    from public.calls c
    join public.profiles p on p.user_id = c.user_id
    join public.tokens t on t.id = c.token_id
    order by c.called_at desc
    limit least(greatest(p_limit, 1), 50)
  ) r;
$$;

revoke all on function public.rankr_recent_calls(integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_recent_calls(integer) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_recent_calls(integer) to service_role;
  end if;
end $$;
