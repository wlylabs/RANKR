-- Dead tokens: at 0.3x or below (−70% or worse from the first paste, DEAD_MULTIPLE in src/lib/params.ts) a
-- token leaves the token boards, and comes back if it recovers. Nothing is deleted: calls on it stay and
-- still count on the caller board. rankr_query gets p_hide_dead (the boards pass true; searches and id
-- lookups don't). The background refresh checks dead tokens hourly (src/lib/store/supabase.ts, no SQL).

do $$
begin
  if to_regclass('public.tokens') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

-- A second signature next to the old one would make calls without p_hide_dead ambiguous.
drop function if exists public.rankr_query(text, text, timestamptz, text, text[], integer, integer);

create or replace function public.rankr_query(
  p_sort      text default 'top',
  p_chain     text default null,
  p_since     timestamptz default null,
  p_q         text default null,
  p_ids       text[] default null,
  p_limit     integer default 50,
  p_offset    integer default 0,
  p_hide_dead boolean default false
) returns jsonb
language sql stable as $$
  with f as (
    select t.* from public.tokens t
    where (p_chain is null or t.chain_id = p_chain)
      and (p_since is null or t.first_pasted_at >= p_since)
      and (p_ids is null or t.id = any (p_ids))
      and (not coalesce(p_hide_dead, false) or t.multiple > 0.3)
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
