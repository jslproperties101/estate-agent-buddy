-- AdminBatch004 — System Health for Admin EAB (features 3, 4, 5, 9, 39, 41, 42, 43, 44).
-- Builds on MainForAdmin-A/B and AdminBatch002/003. TEST project first; never production without Joe's approval.
-- Rollback: supabase/rollback/20261022000000_admin_batch_004_health_rollback.sql
-- Additive only: three new tables and new functions. No existing table, function or constraint is changed.
--
-- In plain words:
--   * DATABASE HEALTH reads Postgres' own statistics: size, table sizes, connections, cache hit rate, slow queries.
--   * STORAGE FORECAST: one reading per day (database size + stored files) is kept in eab_health_daily, so growth can be
--     worked out. Stored files also have their upload dates, so the file forecast works from day one.
--   * BACKUP STATUS: Supabase does not let the database see its own backups, so the plan limits and the AWS backup state
--     are set by the Owner/Admin (eab_health_limits), and every backup check or RESTORE TEST is recorded in
--     eab_backup_tests — kept, never changed or deleted (proof for auditors).
--   * SYNC, PUSH, PERFORMANCE and ERROR views read what the main app already records (eab_usage_events, eab_push_*,
--     eab_bug_reports). Per-agent lists are written to the access log like any other search.

-- =====================================================================================================
-- tables
-- =====================================================================================================
create table if not exists public.eab_health_limits (
  id                boolean primary key default true check (id),
  db_limit_mb       integer not null default 500 check (db_limit_mb between 1 and 100000000),
  storage_limit_mb  integer not null default 1024 check (storage_limit_mb between 1 and 100000000),
  aws_backup        text not null default 'not_set_up' check (aws_backup in ('not_set_up', 'set_up')),
  aws_note          text check (aws_note is null or char_length(aws_note) <= 500),
  updated_at        timestamptz not null default now(),
  updated_by        uuid
);
insert into public.eab_health_limits (id) values (true) on conflict (id) do nothing;

create table if not exists public.eab_health_daily (
  day            date primary key,
  db_bytes       bigint not null,
  storage_bytes  bigint not null,
  storage_files  bigint not null,
  recorded_at    timestamptz not null default now()
);

create sequence if not exists public.eab_backup_test_seq;
create table if not exists public.eab_backup_tests (
  id                uuid primary key default gen_random_uuid(),
  ref               text not null unique,
  tested_on         date not null,
  target            text not null check (target in ('supabase', 'aws', 'other')),
  kind              text not null check (kind in ('restore_test', 'backup_check')),
  result            text not null check (result in ('pass', 'partial', 'fail')),
  what              text not null check (char_length(what) between 1 and 1000),
  duration_minutes  integer check (duration_minutes is null or duration_minutes between 0 and 10080),
  notes             text check (notes is null or char_length(notes) <= 2000),
  recorded_by       uuid not null,
  recorded_by_email text,
  recorded_at       timestamptz not null default now()
);
create index if not exists eab_backup_tests_when on public.eab_backup_tests (tested_on desc, recorded_at desc);

create or replace function public.eab_backup_test_fixed() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'backup test records cannot be changed or deleted' using errcode = '42501';
end $$;
create or replace trigger eab_backup_tests_fixed before update or delete on public.eab_backup_tests for each row execute function public.eab_backup_test_fixed();
create or replace trigger eab_backup_tests_notrunc before truncate on public.eab_backup_tests for each statement execute function public.eab_backup_test_fixed();

alter table public.eab_health_limits enable row level security;
alter table public.eab_health_daily enable row level security;
alter table public.eab_backup_tests enable row level security;
revoke all on public.eab_health_limits, public.eab_health_daily, public.eab_backup_tests from anon, authenticated, public;
revoke all on sequence public.eab_backup_test_seq from anon, authenticated, public;

-- =====================================================================================================
-- internal helpers (not callable by apps)
-- =====================================================================================================
-- Today's reading (Malaysia date). Called by the storage screen; the first call of the day stores it, later calls update it.
create or replace function public.eab_health_snapshot() returns jsonb
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Kuala_Lumpur')::date; dbb bigint; sb bigint; sf bigint;
begin
  dbb := pg_database_size(current_database());
  select coalesce(sum((o.metadata->>'size')::bigint), 0), count(*) into sb, sf from storage.objects o;
  insert into public.eab_health_daily (day, db_bytes, storage_bytes, storage_files) values (d, dbb, sb, sf)
  on conflict (day) do update set db_bytes = excluded.db_bytes, storage_bytes = excluded.storage_bytes,
                                  storage_files = excluded.storage_files, recorded_at = now();
  return jsonb_build_object('day', d, 'db_bytes', dbb, 'storage_bytes', sb, 'storage_files', sf);
end $$;

create or replace function public.eab_health_limits_json() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(l) - 'id' from public.eab_health_limits l where id
$$;

create or replace function public.eab_backup_tests_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'count', (select count(*) from public.eab_backup_tests),
    'last', (select to_jsonb(t) from public.eab_backup_tests t order by tested_on desc, recorded_at desc limit 1),
    'last_restore_pass', (select to_jsonb(t) from public.eab_backup_tests t where kind = 'restore_test' and result = 'pass'
                            order by tested_on desc, recorded_at desc limit 1))
$$;

-- =====================================================================================================
-- feature 4 — Database Health (owner, admin, compliance, viewer; no personal data)
-- =====================================================================================================
create or replace function public.eab_admin_health_db() returns jsonb
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  select jsonb_build_object(
    'checked_at', now(),
    'db_bytes', pg_database_size(current_database()),
    'postgres', current_setting('server_version'),
    'connections', (select jsonb_build_object(
        'total', count(*), 'active', count(*) filter (where a.state = 'active'),
        'idle', count(*) filter (where a.state = 'idle'),
        'idle_in_transaction', count(*) filter (where a.state like 'idle in transaction%'),
        'max', current_setting('max_connections')::int)
      from pg_stat_activity a where a.datname = current_database() and a.backend_type = 'client backend'),
    'longest_query_s', (select coalesce(round(max(extract(epoch from now() - a.query_start))::numeric, 1), 0)
      from pg_stat_activity a where a.datname = current_database() and a.state = 'active'
       and a.backend_type = 'client backend' and a.pid <> pg_backend_pid()),
    'slow_queries', (select count(*) from pg_stat_activity a where a.datname = current_database() and a.state = 'active'
       and a.backend_type = 'client backend' and a.pid <> pg_backend_pid() and now() - a.query_start > interval '5 seconds'),
    'stats', (select jsonb_build_object(
        'cache_hit_pct', round(100.0 * d.blks_hit / nullif(d.blks_hit + d.blks_read, 0), 2),
        'commits', d.xact_commit, 'rollbacks', d.xact_rollback, 'deadlocks', d.deadlocks,
        'temp_bytes', d.temp_bytes, 'since', d.stats_reset)
      from pg_stat_database d where d.datname = current_database()),
    'tables', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', t.relname, 'total_bytes', t.total, 'data_bytes', t.data, 'rows', t.live, 'dead_rows', t.dead,
        'last_vacuum', t.vac, 'last_analyze', t.ana, 'seq_scans', t.seq_scan, 'index_scans', t.idx_scan) order by t.total desc), '[]'::jsonb)
      from (select c.relname, pg_total_relation_size(c.oid) total, pg_relation_size(c.oid) data,
                   coalesce(s.n_live_tup, 0) live, coalesce(s.n_dead_tup, 0) dead,
                   greatest(s.last_vacuum, s.last_autovacuum) vac, greatest(s.last_analyze, s.last_autoanalyze) ana,
                   coalesce(s.seq_scan, 0) seq_scan, coalesce(s.idx_scan, 0) idx_scan
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
              left join pg_stat_user_tables s on s.relid = c.oid
             where n.nspname = 'public' and c.relkind in ('r', 'p')) t),
    'limits', public.eab_health_limits_json()
  ) into out;
  return out;
end $$;

-- =====================================================================================================
-- features 3, 41, 42 — Backup Status, Storage Forecast, Backup Restore Tests
-- =====================================================================================================
create or replace function public.eab_admin_health_storage() returns jsonb
language plpgsql security definer set search_path = public as $$
declare today jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  today := public.eab_health_snapshot();
  return jsonb_build_object(
    'checked_at', now(),
    'today', today,
    'buckets', (select coalesce(jsonb_agg(jsonb_build_object('bucket', b.id, 'files', b.files, 'bytes', b.bytes,
                    'first_at', b.first_at, 'last_at', b.last_at) order by b.bytes desc), '[]'::jsonb)
      from (select bk.id, count(o.id) files, coalesce(sum((o.metadata->>'size')::bigint), 0) bytes,
                   min(o.created_at) first_at, max(o.created_at) last_at
              from storage.buckets bk left join storage.objects o on o.bucket_id = bk.id group by bk.id) b),
    -- uploads per day for the last 180 days (Malaysia dates) — the file forecast uses these from day one
    'uploads', (select coalesce(jsonb_agg(jsonb_build_object('day', u.day, 'files', u.files, 'bytes', u.bytes) order by u.day), '[]'::jsonb)
      from (select (o.created_at at time zone 'Asia/Kuala_Lumpur')::date as day, count(*) files,
                   coalesce(sum((o.metadata->>'size')::bigint), 0) bytes
              from storage.objects o where o.created_at > now() - interval '180 days' group by 1) u),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', h.day, 'db_bytes', h.db_bytes, 'storage_bytes', h.storage_bytes,
                    'storage_files', h.storage_files) order by h.day), '[]'::jsonb)
      from public.eab_health_daily h where h.day > (now() at time zone 'Asia/Kuala_Lumpur')::date - 366),
    'limits', public.eab_health_limits_json(),
    'backup_tests', public.eab_backup_tests_summary()
  );
end $$;

-- Plan limits and AWS backup state (owner / admin). Reason required; recorded in the Master Audit Log.
create or replace function public.eab_admin_set_health_limits(p_patch jsonb, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  if p_patch ? 'aws_backup' and p_patch->>'aws_backup' not in ('not_set_up', 'set_up') then
    raise exception 'unknown AWS backup state' using errcode = '22023'; end if;
  before := public.eab_health_limits_json();
  update public.eab_health_limits set
    db_limit_mb      = case when p_patch ? 'db_limit_mb' then (p_patch->>'db_limit_mb')::int else db_limit_mb end,
    storage_limit_mb = case when p_patch ? 'storage_limit_mb' then (p_patch->>'storage_limit_mb')::int else storage_limit_mb end,
    aws_backup       = case when p_patch ? 'aws_backup' then p_patch->>'aws_backup' else aws_backup end,
    aws_note         = case when p_patch ? 'aws_note' then nullif(btrim(p_patch->>'aws_note'), '') else aws_note end,
    updated_at = now(), updated_by = auth.uid()
   where id;
  after := public.eab_health_limits_json();
  perform public.eab_admin_write_action('health_limits_changed', null, 'eab_health_limits', p_reason, before, after, p_device);
  return after;
end $$;

create or replace function public.eab_admin_backup_tests(p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return (select coalesce(jsonb_agg(to_jsonb(t) order by t.tested_on desc, t.recorded_at desc), '[]'::jsonb)
            from (select * from public.eab_backup_tests order by tested_on desc, recorded_at desc
                   limit least(greatest(coalesce(p_limit, 200), 1), 1000)) t);
end $$;

-- Record one backup check or restore test (owner, admin, compliance). Kept forever; cannot be changed afterwards.
create or replace function public.eab_admin_backup_test_add(p jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare r public.eab_backup_tests; d date; mins integer;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  d := (p->>'tested_on')::date;
  if d is null or d > (now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'the test date cannot be in the future' using errcode = '22023'; end if;
  if d < date '2020-01-01' then raise exception 'the test date is too far in the past' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p->>'what', '')), '') is null then raise exception 'say what was checked or restored' using errcode = '22023'; end if;
  mins := nullif(p->>'duration_minutes', '')::int;
  insert into public.eab_backup_tests (ref, tested_on, target, kind, result, what, duration_minutes, notes, recorded_by, recorded_by_email)
  values ('BKT-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-' || lpad(nextval('public.eab_backup_test_seq')::text, 4, '0'),
          d, p->>'target', p->>'kind', p->>'result', btrim(p->>'what'), mins, nullif(btrim(coalesce(p->>'notes', '')), ''),
          auth.uid(), (select email from auth.users where id = auth.uid()))
  returning * into r;
  perform public.eab_admin_write_action('backup_test_recorded', null, r.ref, null, null, to_jsonb(r), p_device);
  return to_jsonb(r);
end $$;

-- =====================================================================================================
-- features 9, 43 — Notifications & Sync, Sync Failures per agent (owner, admin, compliance)
-- =====================================================================================================
create or replace function public.eab_admin_sync_health(p_days integer default 30, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare days integer := least(greatest(coalesce(p_days, 30), 1), 365); since timestamptz; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  since := now() - make_interval(days => days);
  with ev as (
    select e.user_id, e.at, e.ok, e.app_version, e.platform from public.eab_usage_events e
     where e.kind = 'sync' and e.name = 'sync.run' and e.at > since
  ), per as (
    select ev.user_id, count(*) runs, count(*) filter (where not ev.ok) fails, max(ev.at) last_run,
           max(ev.at) filter (where not ev.ok) last_fail, max(ev.at) filter (where ev.ok) last_ok
      from ev group by ev.user_id
  )
  select jsonb_build_object(
    'days', days, 'checked_at', now(),
    'totals', (select jsonb_build_object('runs', count(*), 'fails', count(*) filter (where not ok),
                 'agents', count(distinct user_id), 'agents_failing', count(distinct user_id) filter (where not ok)) from ev),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'runs', x.runs, 'fails', x.fails) order by x.day), '[]'::jsonb)
      from (select (ev.at at time zone 'Asia/Kuala_Lumpur')::date as day, count(*) runs, count(*) filter (where not ev.ok) fails
              from ev group by 1) x),
    'agents', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', p.user_id, 'email', u.email, 'name', public.eab_admin_name(u),
        'runs', p.runs, 'fails', p.fails, 'last_run', p.last_run, 'last_fail', p.last_fail, 'last_ok', p.last_ok,
        'pending', (select m.value from public.eab_usage_events m where m.user_id = p.user_id and m.kind = 'metric'
                       and m.name = 'records.pending' order by m.at desc limit 1),
        'local_bytes', (select m.value from public.eab_usage_events m where m.user_id = p.user_id and m.kind = 'metric'
                       and m.name = 'storage.local_bytes' order by m.at desc limit 1),
        'app_version', (select ev.app_version from ev where ev.user_id = p.user_id order by ev.at desc limit 1),
        'platform', (select ev.platform from ev where ev.user_id = p.user_id order by ev.at desc limit 1),
        'phones', (select count(*) from public.eab_push_tokens t where t.user_id = p.user_id))
        order by p.fails desc, p.last_fail desc nulls last, p.last_run desc), '[]'::jsonb)
      from per p join auth.users u on u.id = p.user_id)
  ) into out;
  perform public.eab_admin_write_access('search', null, 'sync health: ' || days || ' days',
            jsonb_build_object('results', jsonb_array_length(out->'agents'), 'days', days), p_device);
  return out;
end $$;

-- =====================================================================================================
-- feature 44 — Push delivery (owner, admin, compliance, viewer; counts only)
-- =====================================================================================================
create or replace function public.eab_admin_push_health() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return jsonb_build_object(
    'checked_at', now(),
    'agents', (select count(*) from auth.users u where u.deleted_at is null),
    'agents_with_phone', (select count(distinct t.user_id) from public.eab_push_tokens t),
    'phones', (select coalesce(jsonb_agg(jsonb_build_object('platform', x.platform, 'phones', x.phones, 'agents', x.agents) order by x.phones desc), '[]'::jsonb)
      from (select coalesce(t.platform, 'unknown') platform, count(*) phones, count(distinct t.user_id) agents
              from public.eab_push_tokens t group by 1) x),
    'broadcasts', (select coalesce(jsonb_agg(jsonb_build_object(
        'item_id', b.item_id, 'title', f.title_en, 'status', b.status, 'queued_at', b.queued_at, 'finished_at', b.finished_at,
        'targeted', b.targeted, 'sent', b.sent, 'failed', b.failed, 'no_phone', b.no_phone,
        'received', (select count(*) from public.eab_push_deliveries d where d.item_id = b.item_id and d.received_at is not null),
        'opened', (select count(*) from public.eab_push_deliveries d where d.item_id = b.item_id and d.opened_at is not null),
        'errors', (select coalesce(jsonb_object_agg(e.error, e.n), '{}'::jsonb) from (select d.error, count(*) n from public.eab_push_deliveries d
                     where d.item_id = b.item_id and d.error is not null group by d.error) e))
        order by b.queued_at desc), '[]'::jsonb)
      from (select * from public.eab_push_broadcasts order by queued_at desc limit 100) b
      left join public.eab_feed_items f on f.id = b.item_id),
    'other_pushes_30d', (select coalesce(jsonb_object_agg(x.kind, x.n), '{}'::jsonb)
      from (select s.kind, count(*) n from public.eab_push_sent s where s.sent_at > now() - interval '30 days' group by s.kind) x)
  );
end $$;

-- =====================================================================================================
-- feature 39 — App Performance (owner, admin, compliance, viewer; counts only)
-- =====================================================================================================
create or replace function public.eab_admin_performance(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare days integer := least(greatest(coalesce(p_days, 30), 1), 365); since timestamptz;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  since := now() - make_interval(days => days);
  return jsonb_build_object(
    'days', days, 'checked_at', now(),
    'startup', (select coalesce(jsonb_agg(jsonb_build_object('app_version', s.v, 'platform', s.p, 'opens', s.n,
                    'avg_ms', s.avg_ms, 'p50_ms', s.p50, 'p90_ms', s.p90, 'max_ms', s.mx) order by s.v desc nulls last, s.p), '[]'::jsonb)
      from (select coalesce(e.app_version, '?') v, coalesce(e.platform, 'unknown') p, count(*) n, round(avg(e.value)) avg_ms,
                   round(percentile_cont(0.5) within group (order by e.value)::numeric) p50,
                   round(percentile_cont(0.9) within group (order by e.value)::numeric) p90, round(max(e.value)) mx
              from public.eab_usage_events e
             where e.kind = 'metric' and e.name = 'startup.ms' and e.at > since and e.value is not null group by 1, 2) s),
    'startup_all', (select jsonb_build_object('opens', count(*), 'avg_ms', round(avg(e.value)),
                     'p50_ms', round(percentile_cont(0.5) within group (order by e.value)::numeric),
                     'p90_ms', round(percentile_cont(0.9) within group (order by e.value)::numeric))
      from public.eab_usage_events e where e.kind = 'metric' and e.name = 'startup.ms' and e.at > since and e.value is not null),
    'sessions_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'sessions', x.n, 'agents', x.agents) order by x.day), '[]'::jsonb)
      from (select (e.at at time zone 'Asia/Kuala_Lumpur')::date as day, count(*) n, count(distinct e.user_id) agents
              from public.eab_usage_events e where e.kind = 'session' and e.name = 'session.start' and e.at > since group by 1) x),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('app_version', x.v, 'agents', x.agents) order by x.v desc nulls last), '[]'::jsonb)
      from (select l.v, count(*) agents from (select distinct on (e.user_id) e.user_id, coalesce(e.app_version, '?') v
              from public.eab_usage_events e where e.at > since order by e.user_id, e.at desc) l group by l.v) x),
    'google_calls', (select jsonb_build_object('calls', count(*), 'failed', count(*) filter (where not e.ok))
      from public.eab_usage_events e where e.kind = 'google' and e.at > since)
  );
end $$;

-- =====================================================================================================
-- feature 5 — Error Logs & Crashes: problem reports sent from the main app + failures it records
-- (owner, admin, compliance; the reports name agents, so the list is written to the access log)
-- =====================================================================================================
create or replace function public.eab_admin_error_reports(p_status text default null, p_limit integer default 200, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if p_status is not null and p_status not in ('new', 'seen', 'fixed', 'closed') then raise exception 'unknown status' using errcode = '22023'; end if;
  select jsonb_build_object(
    'checked_at', now(),
    'counts', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb) from (select r.status, count(*) n from public.eab_bug_reports r group by 1) x),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'user_id', r.user_id, 'email', u.email, 'description', r.description, 'has_screenshot', r.screenshot_path is not null,
        'app_version', r.app_version, 'platform', r.platform, 'language', r.language, 'screen', r.screen, 'status', r.status,
        'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
      from (select * from public.eab_bug_reports b where p_status is null or b.status = p_status
             order by b.created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) r
      left join auth.users u on u.id = r.user_id),
    'failures_7d', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'name', x.name, 'failed', x.failed, 'total', x.total,
                      'agents', x.agents, 'last_at', x.last_at) order by x.failed desc), '[]'::jsonb)
      from (select e.kind, e.name, count(*) filter (where not e.ok) failed, count(*) total,
                   count(distinct e.user_id) filter (where not e.ok) agents, max(e.at) filter (where not e.ok) last_at
              from public.eab_usage_events e where e.at > now() - interval '7 days' group by 1, 2
            having count(*) filter (where not e.ok) > 0) x)
  ) into out;
  perform public.eab_admin_write_access('search', null, 'problem reports' || coalesce(': ' || p_status, ''),
            jsonb_build_object('results', jsonb_array_length(out->'reports')), p_device);
  return out;
end $$;

-- =====================================================================================================
-- permissions
-- =====================================================================================================
revoke all on function public.eab_health_snapshot(), public.eab_health_limits_json(), public.eab_backup_tests_summary(),
  public.eab_backup_test_fixed() from public, anon, authenticated;
revoke all on function public.eab_admin_health_db(), public.eab_admin_health_storage(),
  public.eab_admin_set_health_limits(jsonb, text, text), public.eab_admin_backup_tests(integer),
  public.eab_admin_backup_test_add(jsonb, text), public.eab_admin_sync_health(integer, text),
  public.eab_admin_push_health(), public.eab_admin_performance(integer),
  public.eab_admin_error_reports(text, integer, text) from public, anon;
grant execute on function public.eab_admin_health_db(), public.eab_admin_health_storage(),
  public.eab_admin_set_health_limits(jsonb, text, text), public.eab_admin_backup_tests(integer),
  public.eab_admin_backup_test_add(jsonb, text), public.eab_admin_sync_health(integer, text),
  public.eab_admin_push_health(), public.eab_admin_performance(integer),
  public.eab_admin_error_reports(text, integer, text) to authenticated;

-- NOTE (22 Oct 2026): applied to EAB-QA-Test in 6 parts (admin_batch_004_p1_tables … p6_permissions). Production untouched.
-- Tests: supabase/tests/admin_batch_004_test.sql — 30 passed, 0 failed (rolled back).
