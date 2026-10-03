-- Usage budgets for the free APIs the trace tab reads (Blockscout's daily credits, an RPC's monthly credits),
-- so Rankr never runs past their quotas (src/lib/budget.ts).
--
-- 1. rankr_rate_spend: takes p_cost units from a bucket's window only if they fit, in one atomic update, so two
--    servers can't both take the last units. Budget buckets are named by their calendar period
--    ('budget:blockscout:day:2026-10-03'), so a new day or month starts a new bucket.
-- 2. rankr_rate_hit keeps its counters, but its cleanup now spares budget buckets until they're 40 days old (a
--    month's bucket must outlive the 2 days other counters get).

do $$
begin
  if to_regclass('public.rate_limits') is null then
    raise exception 'rankr: run the earlier migrations first (or use supabase/setup.sql, which runs everything in order)';
  end if;
end $$;

create or replace function public.rankr_rate_spend(
  p_bucket text,
  p_window_seconds integer,
  p_max integer,
  p_cost integer
) returns jsonb
language plpgsql as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
  r public.rate_limits;
begin
  -- The bucket, its window started over when it has ended.
  insert into public.rate_limits as l (bucket, window_start, hits) values (p_bucket, v_now, 0)
  on conflict (bucket) do update set
    window_start = case when l.window_start <= v_now - v_window then v_now else l.window_start end,
    hits         = case when l.window_start <= v_now - v_window then 0 else l.hits end;

  -- Take the units only if they fit.
  update public.rate_limits set hits = hits + greatest(p_cost, 0)
   where bucket = p_bucket and hits + greatest(p_cost, 0) <= p_max
  returning * into r;
  if found then
    return jsonb_build_object('ok', true, 'hits', r.hits, 'reset_at', r.window_start + v_window);
  end if;
  select * into r from public.rate_limits where bucket = p_bucket;
  return jsonb_build_object('ok', false, 'hits', r.hits, 'reset_at', r.window_start + v_window);
end $$;

revoke all on function public.rankr_rate_spend(text, integer, integer, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rankr_rate_spend(text, integer, integer, integer) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rankr_rate_spend(text, integer, integer, integer) to service_role;
  end if;
end $$;

-- As before, but the cleanup leaves budget buckets alone until they're 40 days old.
create or replace function public.rankr_rate_hit(p_bucket text, p_window_seconds integer, p_max integer) returns jsonb
language plpgsql as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
  r public.rate_limits;
begin
  insert into public.rate_limits as l (bucket, window_start, hits) values (p_bucket, v_now, 1)
  on conflict (bucket) do update set
    window_start = case when l.window_start <= v_now - v_window then v_now else l.window_start end,
    hits         = case when l.window_start <= v_now - v_window then 1 else l.hits + 1 end
  returning * into r;

  if random() < 0.01 then
    delete from public.rate_limits
     where (bucket not like 'budget:%' and window_start < v_now - interval '2 days')
        or window_start < v_now - interval '40 days';
  end if;

  return jsonb_build_object('ok', r.hits <= p_max, 'hits', r.hits, 'reset_at', r.window_start + v_window);
end $$;
