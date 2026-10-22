-- AdminBatch008 — Admin EAB: Email & WhatsApp broadcast (64), Scheduled Reports (70), Team Workspaces overview (69),
-- To-Do & Calendar (13); main-app part MainForAdmin-F (the agent's own contact number).
-- Builds on the foundation (20261021000000), MainForAdmin-B (terms / marketing answer), MainForAdmin-D (audience groups,
-- eab_my_groups) and AdminBatch005 (dashboard helpers). Does NOT need AdminBatch007 (it can be applied before or after).
-- TEST project first; never production without Joe's approval. No DROP statements; safe to run twice.
-- Rollback: supabase/rollback/20261025000000_admin_batch_008_comms_rollback.sql
--
-- Joe's decisions (22 Oct 2026): email through Resend; WhatsApp both tap-to-send links AND the WhatsApp Business API
-- (built, switched off until Meta keys exist); weekly report PDF kept for 7 years and emailed; To-Do / Calendar items
-- private OR shared with the admin team; the agent's Contact number goes to the company database (MainForAdmin-F);
-- two kinds of broadcast: "service notice" (everyone chosen) and "news & offers" (only agents who said yes to news).
--
-- In plain words:
--   * AGENT PHONE: the agent's own Contact number from Agent Profile (eab_set_my_phone). Seen only by Owner / Admin /
--     Compliance, only in broadcast recipient lists.
--   * BROADCASTS: a draft (email or WhatsApp, service or news, EN / BM / ZH, everyone or audience groups) is QUEUED with a
--     typed reason: at that moment the recipient list is fixed (who, address, language, why skipped). Sending is done by
--     the Edge Function "send-broadcast" with the admin's own sign-in; the function writes each result back. Every
--     broadcast and every recipient row is kept for good. Nothing is ever sent twice to the same person for one broadcast.
--   * UNSUBSCRIBE: every email carries a link; using it turns the agent's "news & offers" answer OFF (the same as the
--     switch in the app). Service notices still arrive.
--   * WEEKLY REPORT: settings (on / off, day, hour, which Owner / Compliance admins get it). The Edge Function
--     "weekly-report" makes the PDF, keeps it in the private vault bucket (reports/<run>/<sha256>, never changed or
--     deleted) and emails it. A run can also be started by hand. Report numbers are totals only, no agent names.
--   * TEAM WORKSPACES OVERVIEW: read-only lists of agents' workspaces and Team Workspaces with their members.
--   * TO-DO & CALENDAR for admins: each task / event is private (only its owner) or shared (the whole admin team sees it;
--     every change to a shared item goes to the Master Audit Log). Removing an item hides it; nothing is deleted.

-- =====================================================================================================
-- MainForAdmin-F — the agent's own contact number
-- =====================================================================================================
create table if not exists public.eab_agent_contacts (
  user_id    uuid primary key references auth.users (id) on delete restrict,
  phone      text check (phone is null or phone ~ '^\+?[0-9]{8,15}$'),
  updated_at timestamptz not null default now()
);
alter table public.eab_agent_contacts enable row level security;
revoke all on public.eab_agent_contacts from anon, authenticated, public;

-- The agent's own number, as typed in Agent Profile (spaces, dashes, brackets and dots are removed). Empty = no number.
create or replace function public.eab_set_my_phone(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p text := regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g');
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  p := nullif(p, '');
  if p is not null and p !~ '^\+?[0-9]{8,15}$' then raise exception 'not a phone number' using errcode = '22023'; end if;
  insert into public.eab_agent_contacts as c (user_id, phone, updated_at) values (uid, p, now())
  on conflict (user_id) do update set phone = excluded.phone, updated_at = now();
  return jsonb_build_object('phone', p);
end $$;

-- The number as WhatsApp needs it (country code + number, digits only). A Malaysian local number 01x… becomes 601x…;
-- a number starting with + keeps its country code. Anything else cannot be used for WhatsApp (null).
create or replace function public.eab_wa_number(p_phone text, p_country text) returns text
language sql immutable as $$
  select case
    when p_phone is null then null
    when p_phone ~ '^\+[0-9]{8,15}$' then substr(p_phone, 2)
    when p_phone ~ '^0[0-9]{8,11}$' and coalesce(p_country, 'Malaysia') = 'Malaysia' then '6' || p_phone
    when p_phone ~ '^60[0-9]{8,11}$' then p_phone
    else null end
$$;

-- =====================================================================================================
-- Broadcasts (64)
-- =====================================================================================================
create sequence if not exists public.eab_broadcast_no;
create table if not exists public.eab_broadcasts (
  id           uuid primary key default gen_random_uuid(),
  ref          text unique,
  channel      text not null check (channel in ('email', 'whatsapp')),
  kind         text not null check (kind in ('service', 'news')),
  subject_en   text check (subject_en is null or char_length(subject_en) between 1 and 200),
  subject_bm   text check (subject_bm is null or char_length(subject_bm) <= 200),
  subject_zh   text check (subject_zh is null or char_length(subject_zh) <= 200),
  body_en      text not null check (char_length(body_en) between 1 and 5000),
  body_bm      text check (body_bm is null or char_length(body_bm) <= 5000),
  body_zh      text check (body_zh is null or char_length(body_zh) <= 5000),
  audience     text not null default 'all' check (audience in ('all', 'groups')),
  group_ids    uuid[] not null default '{}',
  status       text not null default 'draft' check (status in ('draft', 'queued', 'sending', 'done', 'cancelled')),
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  queued_at    timestamptz,
  queued_by    uuid,
  queue_reason text check (queue_reason is null or char_length(queue_reason) <= 2000),
  claimed_at   timestamptz,
  finished_at  timestamptz,
  check (channel <> 'email' or subject_en is not null)
);
create table if not exists public.eab_broadcast_recipients (
  id           bigint generated always as identity primary key,
  broadcast_id uuid not null references public.eab_broadcasts (id) on delete restrict,
  user_id      uuid not null references auth.users (id) on delete restrict,
  address      text,                                    -- email address, or WhatsApp number (digits)
  lang         text not null default 'en' check (lang in ('en', 'bm', 'zh')),
  status       text not null check (status in ('pending', 'sent', 'failed', 'opened_wa', 'cancelled',
                                                'skipped_no_consent', 'skipped_no_address', 'skipped_not_active')),
  error        text check (error is null or char_length(error) <= 500),
  provider_id  text check (provider_id is null or char_length(provider_id) <= 200),
  token        text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  claimed_at   timestamptz,                             -- handed to a sender (send-broadcast) and not finished yet
  sent_at      timestamptz,
  sent_by      uuid,
  unique (broadcast_id, user_id)
);
create index if not exists eab_broadcast_recipients_status on public.eab_broadcast_recipients (broadcast_id, status);
create unique index if not exists eab_broadcast_recipients_token on public.eab_broadcast_recipients (token);

create or replace function public.eab_broadcast_keep() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then raise exception 'broadcast records are kept for good' using errcode = '42501'; end if;
  return new;
end $$;
create or replace trigger eab_broadcasts_keep before delete on public.eab_broadcasts for each row execute function public.eab_broadcast_keep();
create or replace trigger eab_broadcasts_notrunc before truncate on public.eab_broadcasts for each statement execute function public.eab_broadcast_keep();
create or replace trigger eab_broadcast_recipients_keep before delete on public.eab_broadcast_recipients for each row execute function public.eab_broadcast_keep();
create or replace trigger eab_broadcast_recipients_notrunc before truncate on public.eab_broadcast_recipients for each statement execute function public.eab_broadcast_keep();

alter table public.eab_broadcasts enable row level security;
alter table public.eab_broadcast_recipients enable row level security;
revoke all on public.eab_broadcasts, public.eab_broadcast_recipients from anon, authenticated, public;

-- The agent's latest "news & offers" answer (MainForAdmin-B); no answer = no.
create or replace function public.eab_news_consent(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select t.accepted from public.eab_terms_acceptance t where t.user_id = p_user and t.kind = 'marketing'
                    order by t.seq desc limit 1), false)
$$;

-- One agent's place in a broadcast: address, language, and why they are skipped (or 'pending').
create or replace function public.eab_bc_candidate(b public.eab_broadcasts, u auth.users)
returns table (address text, lang text, status text)
language plpgsql stable security definer set search_path = public, auth as $$
declare lg text := coalesce((public.eab_agent_facts(u.id))->>'language', 'en'); addr text; st text;
begin
  if lg not in ('en', 'bm', 'zh') then lg := 'en'; end if;
  if b.channel = 'email' then addr := lower(nullif(btrim(u.email::text), ''));
  else addr := public.eab_wa_number((select c.phone from public.eab_agent_contacts c where c.user_id = u.id), u.raw_user_meta_data->>'country');
  end if;
  st := case
    when exists (select 1 from public.eab_account_status s where s.user_id = u.id and s.status <> 'active') then 'skipped_not_active'
    when b.kind = 'news' and not public.eab_news_consent(u.id) then 'skipped_no_consent'
    when addr is null then 'skipped_no_address'
    else 'pending' end;
  return query select addr, lg, st;
end $$;

-- Is this agent in the broadcast's audience?
create or replace function public.eab_bc_in_audience(b public.eab_broadcasts, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select b.audience = 'all' or exists (select 1 from public.eab_my_groups(p_user) g where g.group_id = any (b.group_ids))
$$;

create or replace function public.eab_bc_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select to_jsonb(b) || jsonb_build_object(
    'created_by_email', (select email from auth.users where id = b.created_by),
    'queued_by_email', (select email from auth.users where id = b.queued_by),
    'counts', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb)
                 from (select r.status, count(*) n from public.eab_broadcast_recipients r where r.broadcast_id = b.id group by 1) x))
  from public.eab_broadcasts b where b.id = p_id
$$;

-- Create or change a DRAFT. p: {id?, channel, kind, subject_en/bm/zh, body_en/bm/zh, audience, group_ids}
create or replace function public.eab_admin_broadcast_save(p jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bid uuid := nullif(p->>'id', '')::uuid; cur public.eab_broadcasts; gids uuid[]; before jsonb; after jsonb;
        t text := nullif(btrim(coalesce(p->>'body_en', '')), '');
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if coalesce(p->>'channel', '') not in ('email', 'whatsapp') then raise exception 'choose email or WhatsApp' using errcode = '22023'; end if;
  if coalesce(p->>'kind', '') not in ('service', 'news') then raise exception 'choose service notice or news & offers' using errcode = '22023'; end if;
  if t is null then raise exception 'the English text is required' using errcode = '22023'; end if;
  if p->>'channel' = 'email' and nullif(btrim(coalesce(p->>'subject_en', '')), '') is null then raise exception 'the English subject is required' using errcode = '22023'; end if;
  if coalesce(p->>'audience', 'all') not in ('all', 'groups') then raise exception 'audience must be all or groups' using errcode = '22023'; end if;
  select coalesce(array_agg(x::uuid), '{}') into gids from jsonb_array_elements_text(coalesce(p->'group_ids', '[]'::jsonb)) x;
  if coalesce(p->>'audience', 'all') = 'groups' and cardinality(gids) = 0 then raise exception 'choose at least one group, or everyone' using errcode = '22023'; end if;
  if exists (select 1 from unnest(gids) g where not exists (select 1 from public.eab_audience_groups a where a.id = g)) then
    raise exception 'unknown audience group' using errcode = '22023';
  end if;
  if bid is not null then
    select * into cur from public.eab_broadcasts where id = bid for update;
    if cur.id is null then raise exception 'broadcast not found' using errcode = 'P0002'; end if;
    if cur.status <> 'draft' then raise exception 'only a draft can be changed' using errcode = '22023'; end if;
    before := to_jsonb(cur);
    update public.eab_broadcasts set channel = p->>'channel', kind = p->>'kind',
      subject_en = nullif(btrim(coalesce(p->>'subject_en', '')), ''), subject_bm = nullif(btrim(coalesce(p->>'subject_bm', '')), ''),
      subject_zh = nullif(btrim(coalesce(p->>'subject_zh', '')), ''), body_en = t,
      body_bm = nullif(btrim(coalesce(p->>'body_bm', '')), ''), body_zh = nullif(btrim(coalesce(p->>'body_zh', '')), ''),
      audience = coalesce(p->>'audience', 'all'), group_ids = gids, updated_at = now()
     where id = bid;
  else
    insert into public.eab_broadcasts (ref, channel, kind, subject_en, subject_bm, subject_zh, body_en, body_bm, body_zh, audience, group_ids, created_by)
    values ('BC-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-' || lpad(nextval('public.eab_broadcast_no')::text, 4, '0'),
            p->>'channel', p->>'kind', nullif(btrim(coalesce(p->>'subject_en', '')), ''), nullif(btrim(coalesce(p->>'subject_bm', '')), ''),
            nullif(btrim(coalesce(p->>'subject_zh', '')), ''), t, nullif(btrim(coalesce(p->>'body_bm', '')), ''),
            nullif(btrim(coalesce(p->>'body_zh', '')), ''), coalesce(p->>'audience', 'all'), gids, auth.uid())
    returning id into bid;
  end if;
  after := public.eab_bc_json(bid);
  perform public.eab_admin_write_action('broadcast_saved', null, after->>'ref', null, before, after - 'counts', p_device);
  return after;
end $$;

-- Before queueing: how many agents the draft reaches, and why the others would be skipped (counts only, no names).
create or replace function public.eab_admin_broadcast_preview(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare b public.eab_broadcasts;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  select * into b from public.eab_broadcasts where id = p_id;
  if b.id is null then raise exception 'broadcast not found' using errcode = 'P0002'; end if;
  return (select jsonb_build_object('matched', count(*),
            'reach', count(*) filter (where c.status = 'pending'),
            'no_address', count(*) filter (where c.status = 'skipped_no_address'),
            'no_consent', count(*) filter (where c.status = 'skipped_no_consent'),
            'not_active', count(*) filter (where c.status = 'skipped_not_active'))
          from auth.users u cross join lateral public.eab_bc_candidate(b, u) c
         where u.deleted_at is null and public.eab_bc_in_audience(b, u.id));
end $$;

-- Queue a draft (typed reason): the recipient list is fixed now and kept for good.
create or replace function public.eab_admin_broadcast_queue(p_id uuid, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare b public.eab_broadcasts; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select * into b from public.eab_broadcasts where id = p_id for update;
  if b.id is null then raise exception 'broadcast not found' using errcode = 'P0002'; end if;
  if b.status <> 'draft' then raise exception 'only a draft can be queued' using errcode = '22023'; end if;
  insert into public.eab_broadcast_recipients (broadcast_id, user_id, address, lang, status)
  select b.id, u.id, c.address, c.lang, c.status
    from auth.users u cross join lateral public.eab_bc_candidate(b, u) c
   where u.deleted_at is null and public.eab_bc_in_audience(b, u.id)
  on conflict (broadcast_id, user_id) do nothing;
  if not exists (select 1 from public.eab_broadcast_recipients r where r.broadcast_id = b.id and r.status = 'pending') then
    raise exception 'nobody can receive this broadcast (no address, no consent, or not active)' using errcode = '22023';
  end if;
  update public.eab_broadcasts set status = 'queued', queued_at = now(), queued_by = auth.uid(), queue_reason = left(btrim(p_reason), 2000), updated_at = now()
   where id = b.id;
  out := public.eab_bc_json(b.id);
  perform public.eab_admin_write_action('broadcast_queued', null, out->>'ref', btrim(p_reason), jsonb_build_object('status', 'draft'),
            jsonb_build_object('status', 'queued', 'counts', out->'counts', 'channel', b.channel, 'kind', b.kind, 'audience', b.audience), p_device);
  return out;
end $$;

-- Cancel a draft or a queued broadcast (people not yet sent to are not sent to).
create or replace function public.eab_admin_broadcast_cancel(p_id uuid, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.eab_broadcasts; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select * into b from public.eab_broadcasts where id = p_id for update;
  if b.id is null then raise exception 'broadcast not found' using errcode = 'P0002'; end if;
  if b.status not in ('draft', 'queued') then raise exception 'only a draft or a queued broadcast can be cancelled' using errcode = '22023'; end if;
  update public.eab_broadcast_recipients set status = 'cancelled' where broadcast_id = b.id and status = 'pending';
  update public.eab_broadcasts set status = 'cancelled', finished_at = now(), updated_at = now() where id = b.id;
  out := public.eab_bc_json(b.id);
  perform public.eab_admin_write_action('broadcast_cancelled', null, out->>'ref', btrim(p_reason), jsonb_build_object('status', b.status),
            jsonb_build_object('status', 'cancelled'), p_device);
  return out;
end $$;

-- List (no names). Owner / Admin / Compliance / Viewer.
create or replace function public.eab_admin_broadcasts(p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return coalesce((select jsonb_agg(public.eab_bc_json(x.id) order by x.created_at desc)
                     from (select id, created_at from public.eab_broadcasts order by created_at desc
                            limit least(greatest(coalesce(p_limit, 200), 1), 1000)) x), '[]'::jsonb);
end $$;

-- One broadcast with its recipients (names, email, phone): Owner / Admin / Compliance; written to the access log.
create or replace function public.eab_admin_broadcast(p_id uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  out := public.eab_bc_json(p_id);
  if out is null then raise exception 'broadcast not found' using errcode = 'P0002'; end if;
  out := out || jsonb_build_object('recipients', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'user_id', r.user_id, 'email', u.email, 'name', public.eab_admin_name(u), 'address', r.address, 'lang', r.lang,
      'status', r.status, 'error', r.error, 'sent_at', r.sent_at, 'sent_by_email', sb.email) order by r.status, u.email), '[]'::jsonb)
    from public.eab_broadcast_recipients r join auth.users u on u.id = r.user_id left join auth.users sb on sb.id = r.sent_by
   where r.broadcast_id = p_id));
  perform public.eab_admin_write_access('search', null, 'broadcast: ' || (out->>'ref'), jsonb_build_object('results', jsonb_array_length(out->'recipients')), p_device);
  return out;
end $$;

-- Tap-to-send (WhatsApp): the admin opened WhatsApp with the message for this agent. Recorded as "opened in WhatsApp"
-- (Admin EAB cannot see whether Send was pressed). The broadcast is done when nobody is left pending.
create or replace function public.eab_admin_broadcast_wa_opened(p_recipient bigint, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.eab_broadcast_recipients; b public.eab_broadcasts;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  select * into r from public.eab_broadcast_recipients where id = p_recipient for update;
  if r.id is null then raise exception 'recipient not found' using errcode = 'P0002'; end if;
  select * into b from public.eab_broadcasts where id = r.broadcast_id for update;
  if b.channel <> 'whatsapp' then raise exception 'not a WhatsApp broadcast' using errcode = '22023'; end if;
  if b.status not in ('queued', 'sending') then raise exception 'this broadcast is not being sent' using errcode = '22023'; end if;
  if r.status <> 'pending' then raise exception 'already done for this agent' using errcode = '22023'; end if;
  update public.eab_broadcast_recipients set status = 'opened_wa', sent_at = now(), sent_by = auth.uid() where id = r.id;
  update public.eab_broadcasts set status = case when exists (select 1 from public.eab_broadcast_recipients x where x.broadcast_id = b.id and x.status = 'pending')
                                                  then 'sending' else 'done' end,
         finished_at = case when exists (select 1 from public.eab_broadcast_recipients x where x.broadcast_id = b.id and x.status = 'pending') then null else now() end,
         updated_at = now()
   where id = b.id;
  perform public.eab_admin_write_action('broadcast_wa_opened', r.user_id, b.ref, null, null, jsonb_build_object('recipient', r.id), p_device);
  return public.eab_bc_json(b.id);
end $$;

-- ---------- for the Edge Function "send-broadcast" ----------
-- Called WITH THE ADMIN'S OWN SIGN-IN: checks the role, marks the broadcast as being sent and hands out the next people to
-- send to (at most p_limit). Each person handed out is marked as "being sent" for 15 minutes, so a second sender running
-- at the same time (or a repeated call) never gets the same person; a sender that stopped half-way is replaced after
-- 15 minutes. A result is written only once per person (eab_bc_result).
create or replace function public.eab_admin_broadcast_claim(p_id uuid, p_limit integer default 100, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.eab_broadcasts; got jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  select * into b from public.eab_broadcasts where id = p_id for update;
  if b.id is null then raise exception 'broadcast not found' using errcode = 'P0002'; end if;
  if b.status not in ('queued', 'sending') then raise exception 'this broadcast is not waiting to be sent' using errcode = '22023'; end if;
  if b.claimed_at is null then
    perform public.eab_admin_write_action('broadcast_send_started', null, b.ref, null, null, jsonb_build_object('channel', b.channel), p_device);
  end if;
  update public.eab_broadcasts set status = 'sending', claimed_at = now(), updated_at = now() where id = b.id;
  with picked as (
    select x.id from public.eab_broadcast_recipients x
     where x.broadcast_id = b.id and x.status = 'pending' and (x.claimed_at is null or x.claimed_at < now() - interval '15 minutes')
     order by x.id limit least(greatest(coalesce(p_limit, 100), 1), 500) for update skip locked),
  marked as (
    update public.eab_broadcast_recipients r set claimed_at = now() from picked where r.id = picked.id
    returning r.id, r.address, r.lang, r.token)
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'address', m.address, 'lang', m.lang, 'token', m.token) order by m.id), '[]'::jsonb)
    into got from marked m;
  return jsonb_build_object('broadcast', to_jsonb(b) - 'queue_reason', 'recipients', got,
    'left', (select count(*) from public.eab_broadcast_recipients x where x.broadcast_id = b.id and x.status = 'pending'));
end $$;

-- SERVICE ROLE ONLY (the Edge Function's own key): one result per recipient. Only a pending row can change.
create or replace function public.eab_bc_result(p_recipient bigint, p_ok boolean, p_error text default null, p_provider_id text default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.eab_broadcast_recipients set status = case when p_ok then 'sent' else 'failed' end, error = left(p_error, 500),
         provider_id = left(p_provider_id, 200), sent_at = case when p_ok then now() end
   where id = p_recipient and status = 'pending';
  return found;
end $$;
-- SERVICE ROLE ONLY: the sender could not start (that channel is not set up): the broadcast goes back to "queued" at once,
-- as long as nobody has been sent to yet.
create or replace function public.eab_bc_unclaim(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.eab_broadcasts set status = 'queued', claimed_at = null, updated_at = now()
   where id = p_id and status = 'sending'
     and not exists (select 1 from public.eab_broadcast_recipients r where r.broadcast_id = p_id and r.status not in ('pending', 'cancelled')
                       and r.status not like 'skipped%');
  if not found then return false; end if;
  update public.eab_broadcast_recipients set claimed_at = null where broadcast_id = p_id and status = 'pending';
  return true;
end $$;
-- SERVICE ROLE ONLY: a broadcast with nobody left pending is done.
create or replace function public.eab_bc_finish(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  update public.eab_broadcasts set status = 'done', finished_at = now(), updated_at = now()
   where id = p_id and status = 'sending'
     and not exists (select 1 from public.eab_broadcast_recipients r where r.broadcast_id = p_id and r.status = 'pending');
  select status into st from public.eab_broadcasts where id = p_id;
  return st;
end $$;
-- SERVICE ROLE ONLY: the unsubscribe link in an email. Turns the agent's "news & offers" answer OFF (kept as history).
create or replace function public.eab_bc_unsubscribe(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.eab_broadcast_recipients;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then return jsonb_build_object('ok', false); end if;
  select * into r from public.eab_broadcast_recipients where token = p_token;
  if r.id is null then return jsonb_build_object('ok', false); end if;
  if public.eab_news_consent(r.user_id) then
    insert into public.eab_terms_acceptance (user_id, kind, accepted, device_id) values (r.user_id, 'marketing', false, 'email-unsubscribe');
  end if;
  return jsonb_build_object('ok', true, 'lang', r.lang);
end $$;

-- =====================================================================================================
-- Scheduled Reports (70)
-- =====================================================================================================
create table if not exists public.eab_report_settings (
  id          boolean primary key default true check (id),
  enabled     boolean not null default false,
  weekday     integer not null default 1 check (weekday between 1 and 7),    -- ISO: 1 = Monday
  hour        integer not null default 8 check (hour between 0 and 23),      -- Malaysia time
  recipients  uuid[] not null default '{}',                                  -- Owner / Compliance admins
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
insert into public.eab_report_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.eab_report_runs (
  id           uuid primary key default gen_random_uuid(),
  ref          text not null unique,
  period_from  date not null,
  period_to    date not null,
  trigger      text not null check (trigger in ('schedule', 'manual')),
  status       text not null default 'making' check (status in ('making', 'stored', 'emailed', 'failed')),
  file_name    text check (file_name is null or char_length(file_name) <= 200),
  sha256       text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  bytes        bigint check (bytes is null or (bytes > 0 and bytes <= 52428800)),
  emailed_to   text[] not null default '{}',
  error        text check (error is null or char_length(error) <= 1000),
  started_by   uuid not null,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz,
  check (period_to >= period_from)
);
create unique index if not exists eab_report_runs_week on public.eab_report_runs (period_from) where trigger = 'schedule';
create or replace trigger eab_report_runs_keep before delete on public.eab_report_runs for each row execute function public.eab_broadcast_keep();
create or replace trigger eab_report_runs_notrunc before truncate on public.eab_report_runs for each statement execute function public.eab_broadcast_keep();
alter table public.eab_report_settings enable row level security;
alter table public.eab_report_runs enable row level security;
revoke all on public.eab_report_settings, public.eab_report_runs from anon, authenticated, public;

-- An audit row for something the weekly schedule did by itself: written in the name of the Owner who switched it on,
-- with the device "weekly schedule" (the Master Audit Log needs a person; nobody is pretending to have clicked).
create or replace function public.eab_report_audit(p_user uuid, p_action text, p_ref text, p_after jsonb) returns void
language sql security definer set search_path = public, auth as $$
  insert into public.eab_admin_actions (admin_user, admin_email, admin_role, action, target_user, target_ref, reason, before, after, device, prev_hash, hash)
  select p_user, u.email, (select a.role from public.eab_admins a where a.user_id = p_user), p_action, null, left(p_ref, 300), null, null, p_after,
         'weekly schedule', '', ''
    from auth.users u where u.id = p_user
$$;

create or replace function public.eab_admin_report_settings() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  return (select to_jsonb(s) || jsonb_build_object(
            'recipient_emails', (select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', a.email, 'role', a.role) order by a.email), '[]'::jsonb)
                                   from public.eab_admins a where a.user_id = any (s.recipients)),
            'can_receive', (select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', a.email, 'role', a.role) order by a.email), '[]'::jsonb)
                              from public.eab_admins a where a.active and a.role in ('owner', 'compliance') and (a.expires_at is null or a.expires_at > now())))
          from public.eab_report_settings s where s.id);
end $$;

-- Owner only: switch on / off, day, hour, recipients (Owner / Compliance only). Reason required.
create or replace function public.eab_admin_report_settings_save(p jsonb, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare before jsonb; rec uuid[];
begin
  perform public.eab_admin_guard(array['owner']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into rec from jsonb_array_elements_text(coalesce(p->'recipients', '[]'::jsonb)) x;
  if exists (select 1 from unnest(rec) r where not exists (select 1 from public.eab_admins a where a.user_id = r and a.active and a.role in ('owner', 'compliance'))) then
    raise exception 'the report can only go to Owner or Compliance admins' using errcode = '22023';
  end if;
  if coalesce((p->>'enabled')::boolean, false) and cardinality(rec) = 0 then raise exception 'choose who gets the report' using errcode = '22023'; end if;
  select to_jsonb(s) into before from public.eab_report_settings s where s.id;
  update public.eab_report_settings set enabled = coalesce((p->>'enabled')::boolean, enabled),
    weekday = coalesce((p->>'weekday')::integer, weekday), hour = coalesce((p->>'hour')::integer, hour),
    recipients = case when p ? 'recipients' then rec else recipients end, updated_by = auth.uid(), updated_at = now()
   where id;
  perform public.eab_admin_write_action('report_settings', null, 'weekly report', btrim(p_reason), before,
            (select to_jsonb(s) from public.eab_report_settings s where s.id), p_device);
  return public.eab_admin_report_settings();
end $$;

create or replace function public.eab_admin_reports(p_limit integer default 100, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  return coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('started_by_email', u.email) order by r.created_at desc)
                     from (select * from public.eab_report_runs order by created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) r
                     left join auth.users u on u.id = r.started_by), '[]'::jsonb);
end $$;

-- Download one stored report (written to the access log). Returns the storage path.
create or replace function public.eab_admin_report_download(p_run uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.eab_report_runs;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  select * into r from public.eab_report_runs where id = p_run and status in ('stored', 'emailed');
  if r.id is null then raise exception 'report not found' using errcode = 'P0002'; end if;
  perform public.eab_admin_write_access('download_pack', null, r.ref, jsonb_build_object('report', r.id), p_device);
  return jsonb_build_object('path', 'reports/' || r.id || '/' || r.sha256, 'file_name', r.file_name, 'sha256', r.sha256);
end $$;

-- "Check a file" for weekly reports (the Document Vault's check also asks this): is this exact file a stored report?
create or replace function public.eab_admin_check_report(p_sha256 text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare out jsonb; h text := lower(btrim(coalesce(p_sha256, '')));
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if h !~ '^[0-9a-f]{64}$' then raise exception 'not a fingerprint' using errcode = '22023'; end if;
  select to_jsonb(r) || jsonb_build_object('started_by_email', u.email) into out
    from public.eab_report_runs r left join auth.users u on u.id = r.started_by
   where r.sha256 = h and r.status in ('stored', 'emailed') limit 1;
  perform public.eab_admin_write_access('check_file', null, left(h, 16), jsonb_build_object('found', out is not null, 'report', true), p_device);
  return out;
end $$;

-- The week before p_day (Monday to Sunday, Malaysia time).
create or replace function public.eab_report_week(p_day date) returns table (period_from date, period_to date)
language sql immutable as $$
  select (date_trunc('week', p_day::timestamp)::date - 7), (date_trunc('week', p_day::timestamp)::date - 1)
$$;

-- Manual run, WITH THE ADMIN'S OWN SIGN-IN (Owner / Compliance): makes a run row for the last full week.
create or replace function public.eab_admin_report_claim(p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w record; rid uuid; ref text; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select * into w from public.eab_report_week(public.eab_dash_today());
  ref := 'RPT-' || to_char(w.period_from, 'IYYY') || '-W' || to_char(w.period_from, 'IW') || '-M' || to_char(clock_timestamp() at time zone 'Asia/Kuala_Lumpur', 'DDHH24MISS');
  insert into public.eab_report_runs (ref, period_from, period_to, trigger, started_by) values (ref, w.period_from, w.period_to, 'manual', auth.uid())
  returning id into rid;
  out := (select to_jsonb(r) from public.eab_report_runs r where r.id = rid);
  perform public.eab_admin_write_action('report_run', null, ref, btrim(p_reason), null, out, p_device);
  return out || jsonb_build_object('recipients', (select coalesce(jsonb_agg(a.email), '[]'::jsonb) from public.eab_report_settings s
                                                    join public.eab_admins a on a.user_id = any (s.recipients) and a.active where s.id));
end $$;

-- SERVICE ROLE ONLY: the hourly check. Makes this week's scheduled run if the schedule is on, today is the day, the hour
-- has come (Malaysia time) and it has not been made yet. Returns the run, or null.
create or replace function public.eab_report_claim_scheduled(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.eab_report_settings; local timestamp := p_now at time zone 'Asia/Kuala_Lumpur'; w record; rid uuid; ref text; out jsonb;
begin
  select * into s from public.eab_report_settings where id;
  if not s.enabled or s.updated_by is null or cardinality(s.recipients) = 0 then return null; end if;
  if extract(isodow from local)::int <> s.weekday or extract(hour from local)::int < s.hour then return null; end if;
  select * into w from public.eab_report_week(local::date);
  ref := 'RPT-' || to_char(w.period_from, 'IYYY') || '-W' || to_char(w.period_from, 'IW');
  insert into public.eab_report_runs (ref, period_from, period_to, trigger, started_by) values (ref, w.period_from, w.period_to, 'schedule', s.updated_by)
  on conflict do nothing returning id into rid;
  if rid is null then return null; end if;
  out := (select to_jsonb(r) from public.eab_report_runs r where r.id = rid);
  perform public.eab_report_audit(s.updated_by, 'report_run', ref, out);
  return out || jsonb_build_object('recipients', (select coalesce(jsonb_agg(a.email), '[]'::jsonb) from public.eab_admins a
                                                   where a.user_id = any (s.recipients) and a.active and a.role in ('owner', 'compliance')));
end $$;

-- SERVICE ROLE ONLY: the numbers in the report (totals only, no names), for one run.
create or replace function public.eab_report_data(p_run uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare r public.eab_report_runs; lo timestamptz; hi timestamptz; s public.eab_settings; out jsonb;
begin
  select * into r from public.eab_report_runs where id = p_run;
  if r.id is null then raise exception 'report not found' using errcode = 'P0002'; end if;
  lo := public.eab_dash_ts(r.period_from); hi := public.eab_dash_ts(r.period_to + 1);
  select * into s from public.eab_settings where id;
  with a as (select * from public.eab_dash_activity(r.period_from, r.period_to))
  select jsonb_build_object(
    'ref', r.ref, 'from', r.period_from, 'to', r.period_to, 'company', s.company_name, 'made_at', now(),
    'agents_total', (select count(*) from auth.users u where u.deleted_at is null and u.created_at < hi),
    'agents_new', (select count(*) from auth.users u where u.created_at >= lo and u.created_at < hi),
    'agents_active', (select count(distinct a.user_id) from a),
    'active_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'agents', d.n) order by d.day), '[]'::jsonb)
       from (select g::date as day, (select count(distinct a.user_id) from a where a.day = g::date) n
               from generate_series(r.period_from, r.period_to, interval '1 day') g) d),
    'listings', (select count(*) from public.eab_records x where x.collection = 'properties' and not x.deleted),
    'listings_new', (select count(*) from public.eab_records x where x.collection = 'properties' and (x.data->>'created') ~ '^[0-9]+(\.[0-9]+)?$'
                      and to_timestamp((x.data->>'created')::double precision / 1000) >= lo and to_timestamp((x.data->>'created')::double precision / 1000) < hi),
    'closed', (select count(*) from public.eab_records x where x.collection = 'properties' and not x.deleted
                and public.eab_dash_status_key(x.data) in ('sold', 'rented')
                and x.updated >= (extract(epoch from lo) * 1000)::bigint and x.updated < (extract(epoch from hi) * 1000)::bigint),
    'sync_runs', (select count(*) from public.eab_usage_events e where e.kind = 'sync' and e.name = 'sync.run' and e.at >= lo and e.at < hi),
    'sync_fails', (select count(*) from public.eab_usage_events e where e.kind = 'sync' and e.name = 'sync.run' and not e.ok and e.at >= lo and e.at < hi),
    'tickets_new', (select count(*) from public.eab_bug_reports b where b.created_at >= lo and b.created_at < hi),
    'tickets_open', (select count(*) from public.eab_bug_reports b where b.status in ('new', 'seen')),
    'posts_published', (select count(*) from public.eab_feed_items i where i.published_at >= lo and i.published_at < hi),
    'broadcasts_sent', (select count(*) from public.eab_broadcasts b where b.queued_at >= lo and b.queued_at < hi),
    'accounts_not_active', (select count(*) from public.eab_account_status st where st.status <> 'active'),
    'licences_unverified', (select count(*) from public.eab_licences l where not coalesce(l.verified, false)),
    'admin_actions', (select count(*) from public.eab_admin_actions x where x.at >= lo and x.at < hi),
    'admin_views', (select count(*) from public.eab_admin_access x where x.at >= lo and x.at < hi),
    'log_chain_ok', (public.eab_admin_check_chain('eab_admin_actions')->>'ok')::boolean and (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean
  ) into out;
  return out;
end $$;

-- SERVICE ROLE ONLY: the PDF is in the bucket; then the email result.
create or replace function public.eab_report_stored(p_run uuid, p_file_name text, p_sha256 text, p_bytes bigint) returns jsonb
language plpgsql security definer set search_path = public, storage as $$
declare r public.eab_report_runs;
begin
  select * into r from public.eab_report_runs where id = p_run and status = 'making' for update;
  if r.id is null then raise exception 'report not found or already stored' using errcode = 'P0002'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'eab-vault' and o.name = 'reports/' || r.id || '/' || lower(p_sha256)) then
    raise exception 'the file is not in the vault yet' using errcode = 'P0002';
  end if;
  update public.eab_report_runs set status = 'stored', file_name = left(p_file_name, 200), sha256 = lower(p_sha256), bytes = p_bytes where id = r.id;
  return (select to_jsonb(x) from public.eab_report_runs x where x.id = r.id);
end $$;
create or replace function public.eab_report_finished(p_run uuid, p_emailed_to text[], p_error text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.eab_report_runs;
begin
  select * into r from public.eab_report_runs where id = p_run for update;
  if r.id is null then raise exception 'report not found' using errcode = 'P0002'; end if;
  update public.eab_report_runs set
    status = case when r.status = 'making' then 'failed' when cardinality(coalesce(p_emailed_to, '{}')) > 0 then 'emailed' else r.status end,
    emailed_to = coalesce(p_emailed_to, '{}'), error = left(p_error, 1000), finished_at = now()
   where id = r.id;
  if r.trigger = 'schedule' then
    perform public.eab_report_audit(r.started_by, 'report_finished', r.ref, (select to_jsonb(x) - 'error' from public.eab_report_runs x where x.id = r.id));
  end if;
  return (select to_jsonb(x) from public.eab_report_runs x where x.id = r.id);
end $$;

-- Reports may be read from the vault bucket by Owner / Compliance (the Edge Function uploads them with its own key).
create or replace function public.eab_report_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.eab_admin_role() in ('owner', 'compliance'), false) and exists (
    select 1 from public.eab_report_runs r
     where p_name = 'reports/' || r.id || '/' || r.sha256 and r.status in ('stored', 'emailed'))
$$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'eab vault read reports') then
    create policy "eab vault read reports" on storage.objects for select to authenticated
      using (bucket_id = 'eab-vault' and public.eab_report_can_read(name));
  end if;
end $$;
-- no upload, update or delete policy for reports: only the Edge Function (service key) writes them, once.

-- =====================================================================================================
-- Team Workspaces overview (69) — read only
-- =====================================================================================================
create or replace function public.eab_admin_workspaces(p_q text default null, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare q text := nullif(btrim(coalesce(p_q, '')), ''); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  select jsonb_build_object(
    'workspaces', (select coalesce(jsonb_agg(w.j order by w.created_at desc), '[]'::jsonb) from (
       select ws.created_at, jsonb_build_object('id', ws.id, 'name', ws.name, 'created_at', ws.created_at,
                'owner_email', ou.email, 'owner_name', public.eab_admin_name(ou),
                'members', (select count(*) from public.eab_members m where m.workspace_id = ws.id and m.active),
                'records', (select count(*) from public.eab_records r where r.workspace_id = ws.id and not r.deleted),
                'listings', (select count(*) from public.eab_records r where r.workspace_id = ws.id and r.collection = 'properties' and not r.deleted)) j
         from public.eab_workspaces ws left join auth.users ou on ou.id = ws.created_by
        where q is null or ws.name ilike '%' || q || '%' or ou.email ilike '%' || q || '%'
           or exists (select 1 from public.eab_members m where m.workspace_id = ws.id and m.email ilike '%' || q || '%')
        order by ws.created_at desc limit 500) w),
    'teams', (select coalesce(jsonb_agg(t.j order by t.created_at desc), '[]'::jsonb) from (
       select tm.created_at, jsonb_build_object('id', tm.id, 'created_at', tm.created_at, 'ended_at', tm.ended_at, 'end_reason', tm.end_reason,
                'leader_email', lu.email, 'leader_name', public.eab_admin_name(lu),
                'members', (select coalesce(jsonb_agg(jsonb_build_object('email', x.email, 'name', x.name, 'joined_at', x.joined_at, 'left_at', x.left_at)
                                       order by x.joined_at), '[]'::jsonb) from public.eab_team_members x where x.team_id = tm.id)) j
         from public.eab_teams tm left join auth.users lu on lu.id = tm.created_by
        where q is null or lu.email ilike '%' || q || '%'
           or exists (select 1 from public.eab_team_members x where x.team_id = tm.id and (x.email ilike '%' || q || '%' or x.name ilike '%' || q || '%'))
        order by tm.created_at desc limit 500) t)
  ) into out;
  perform public.eab_admin_write_access('search', null, 'workspaces' || coalesce(' "' || left(q, 60) || '"', ''),
            jsonb_build_object('workspaces', jsonb_array_length(out->'workspaces'), 'teams', jsonb_array_length(out->'teams')), p_device);
  return out;
end $$;

-- One workspace: members and what is in it (counts per kind of record; the records themselves are in the Agent Profile Viewer).
create or replace function public.eab_admin_workspace(p_id uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  select jsonb_build_object('id', ws.id, 'name', ws.name, 'created_at', ws.created_at, 'owner_user', ws.created_by,
           'owner_email', ou.email, 'owner_name', public.eab_admin_name(ou),
           'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', m.email, 'role', m.role, 'active', m.active,
                         'joined_at', m.created_at) order by m.created_at), '[]'::jsonb) from public.eab_members m where m.workspace_id = ws.id),
           'by_kind', (select coalesce(jsonb_object_agg(x.collection, x.n), '{}'::jsonb)
                         from (select r.collection, count(*) n from public.eab_records r where r.workspace_id = ws.id and not r.deleted group by 1) x),
           'deleted', (select count(*) from public.eab_records r where r.workspace_id = ws.id and r.deleted))
    into out from public.eab_workspaces ws left join auth.users ou on ou.id = ws.created_by where ws.id = p_id;
  if out is null then raise exception 'workspace not found' using errcode = 'P0002'; end if;
  perform public.eab_admin_write_access('search', (out->>'owner_user')::uuid, 'workspace: ' || p_id, null, p_device);
  return out;
end $$;

-- =====================================================================================================
-- Admin To-Do & Calendar (13)
-- =====================================================================================================
create table if not exists public.eab_admin_tasks (
  id          uuid primary key default gen_random_uuid(),
  owner_user  uuid not null,
  shared      boolean not null default false,
  title       text not null check (char_length(title) between 1 and 200),
  notes       text check (notes is null or char_length(notes) <= 2000),
  due_on      date,
  done        boolean not null default false,
  done_at     timestamptz,
  done_by     uuid,
  removed     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create table if not exists public.eab_admin_events (
  id          uuid primary key default gen_random_uuid(),
  owner_user  uuid not null,
  shared      boolean not null default false,
  title       text not null check (char_length(title) between 1 and 200),
  notes       text check (notes is null or char_length(notes) <= 2000),
  place       text check (place is null or char_length(place) <= 200),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  removed     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists eab_admin_tasks_owner on public.eab_admin_tasks (owner_user) where not removed;
create index if not exists eab_admin_events_start on public.eab_admin_events (starts_at) where not removed;
create or replace trigger eab_admin_tasks_keep before delete on public.eab_admin_tasks for each row execute function public.eab_broadcast_keep();
create or replace trigger eab_admin_events_keep before delete on public.eab_admin_events for each row execute function public.eab_broadcast_keep();
alter table public.eab_admin_tasks enable row level security;
alter table public.eab_admin_events enable row level security;
revoke all on public.eab_admin_tasks, public.eab_admin_events from anon, authenticated, public;

-- My own items and every shared one (not removed). Any admin role except regulator.
create or replace function public.eab_admin_todo() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return jsonb_build_object(
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('owner_email', ou.email, 'done_by_email', du.email, 'mine', t.owner_user = auth.uid())
                order by t.done, t.due_on nulls last, t.created_at), '[]'::jsonb)
                from public.eab_admin_tasks t left join auth.users ou on ou.id = t.owner_user left join auth.users du on du.id = t.done_by
               where not t.removed and (t.owner_user = auth.uid() or t.shared)),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object('owner_email', ou.email, 'mine', e.owner_user = auth.uid()) order by e.starts_at), '[]'::jsonb)
                 from public.eab_admin_events e left join auth.users ou on ou.id = e.owner_user
                where not e.removed and (e.owner_user = auth.uid() or e.shared)));
end $$;

-- May the caller change this item? Their own: yes (any role). Shared: Owner / Admin / Compliance (a Viewer only reads).
create or replace function public.eab_admin_todo_may(p_owner uuid, p_shared boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner = auth.uid() or (p_shared and coalesce(public.eab_admin_role() in ('owner', 'admin', 'compliance'), false))
$$;

-- Create or change a task. p: {id?, title, notes, due_on, shared, done, removed}
create or replace function public.eab_admin_task_save(p jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare tid uuid := nullif(p->>'id', '')::uuid; cur public.eab_admin_tasks; after jsonb; sh boolean;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  if tid is null then
    if nullif(btrim(coalesce(p->>'title', '')), '') is null then raise exception 'a title is required' using errcode = '22023'; end if;
    sh := coalesce((p->>'shared')::boolean, false);
    if sh and public.eab_admin_role() = 'viewer' then raise exception 'a Viewer can only make private items' using errcode = '42501'; end if;
    insert into public.eab_admin_tasks (owner_user, shared, title, notes, due_on, updated_by)
    values (auth.uid(), sh, btrim(p->>'title'), nullif(btrim(coalesce(p->>'notes', '')), ''), nullif(p->>'due_on', '')::date, auth.uid())
    returning id into tid;
    select to_jsonb(t) into after from public.eab_admin_tasks t where t.id = tid;
    if sh then perform public.eab_admin_write_action('admin_task_added', null, 'task: ' || left(after->>'title', 80), null, null, after, p_device); end if;
    return after;
  end if;
  select * into cur from public.eab_admin_tasks where id = tid and not removed for update;
  if cur.id is null then raise exception 'task not found' using errcode = 'P0002'; end if;
  if not public.eab_admin_todo_may(cur.owner_user, cur.shared) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p ? 'shared' and (p->>'shared')::boolean is distinct from cur.shared and cur.owner_user <> auth.uid() then
    raise exception 'only the person who made it can make it private or shared' using errcode = '42501';
  end if;
  if p ? 'title' and nullif(btrim(coalesce(p->>'title', '')), '') is null then raise exception 'a title is required' using errcode = '22023'; end if;
  update public.eab_admin_tasks set
    title = coalesce(nullif(btrim(p->>'title'), ''), title),
    notes = case when p ? 'notes' then nullif(btrim(coalesce(p->>'notes', '')), '') else notes end,
    due_on = case when p ? 'due_on' then nullif(p->>'due_on', '')::date else due_on end,
    shared = case when p ? 'shared' then coalesce((p->>'shared')::boolean, shared) else shared end,
    done = case when p ? 'done' then coalesce((p->>'done')::boolean, done) else done end,
    done_at = case when p ? 'done' and coalesce((p->>'done')::boolean, false) and not done then now() when p ? 'done' and not coalesce((p->>'done')::boolean, false) then null else done_at end,
    done_by = case when p ? 'done' and coalesce((p->>'done')::boolean, false) and not done then auth.uid() when p ? 'done' and not coalesce((p->>'done')::boolean, false) then null else done_by end,
    removed = case when p ? 'removed' then coalesce((p->>'removed')::boolean, removed) else removed end,
    updated_at = now(), updated_by = auth.uid()
   where id = tid;
  select to_jsonb(t) into after from public.eab_admin_tasks t where t.id = tid;
  if cur.shared or (after->>'shared')::boolean then
    perform public.eab_admin_write_action(case when (after->>'removed')::boolean then 'admin_task_removed' else 'admin_task_changed' end, null,
              'task: ' || left(after->>'title', 80), null, to_jsonb(cur), after, p_device);
  end if;
  return after;
end $$;

-- Create or change a calendar event. p: {id?, title, notes, place, starts_at, ends_at, all_day, shared, removed}
create or replace function public.eab_admin_event_save(p jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare eid uuid := nullif(p->>'id', '')::uuid; cur public.eab_admin_events; after jsonb; sh boolean;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  if eid is null then
    if nullif(btrim(coalesce(p->>'title', '')), '') is null then raise exception 'a title is required' using errcode = '22023'; end if;
    if nullif(p->>'starts_at', '') is null then raise exception 'a start time is required' using errcode = '22023'; end if;
    sh := coalesce((p->>'shared')::boolean, false);
    if sh and public.eab_admin_role() = 'viewer' then raise exception 'a Viewer can only make private items' using errcode = '42501'; end if;
    insert into public.eab_admin_events (owner_user, shared, title, notes, place, starts_at, ends_at, all_day, updated_by)
    values (auth.uid(), sh, btrim(p->>'title'), nullif(btrim(coalesce(p->>'notes', '')), ''), nullif(btrim(coalesce(p->>'place', '')), ''),
            (p->>'starts_at')::timestamptz, nullif(p->>'ends_at', '')::timestamptz, coalesce((p->>'all_day')::boolean, false), auth.uid())
    returning id into eid;
    select to_jsonb(e) into after from public.eab_admin_events e where e.id = eid;
    if sh then perform public.eab_admin_write_action('admin_event_added', null, 'event: ' || left(after->>'title', 80), null, null, after, p_device); end if;
    return after;
  end if;
  select * into cur from public.eab_admin_events where id = eid and not removed for update;
  if cur.id is null then raise exception 'event not found' using errcode = 'P0002'; end if;
  if not public.eab_admin_todo_may(cur.owner_user, cur.shared) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p ? 'shared' and (p->>'shared')::boolean is distinct from cur.shared and cur.owner_user <> auth.uid() then
    raise exception 'only the person who made it can make it private or shared' using errcode = '42501';
  end if;
  update public.eab_admin_events set
    title = coalesce(nullif(btrim(p->>'title'), ''), title),
    notes = case when p ? 'notes' then nullif(btrim(coalesce(p->>'notes', '')), '') else notes end,
    place = case when p ? 'place' then nullif(btrim(coalesce(p->>'place', '')), '') else place end,
    starts_at = coalesce(nullif(p->>'starts_at', '')::timestamptz, starts_at),
    ends_at = case when p ? 'ends_at' then nullif(p->>'ends_at', '')::timestamptz else ends_at end,
    all_day = case when p ? 'all_day' then coalesce((p->>'all_day')::boolean, all_day) else all_day end,
    shared = case when p ? 'shared' then coalesce((p->>'shared')::boolean, shared) else shared end,
    removed = case when p ? 'removed' then coalesce((p->>'removed')::boolean, removed) else removed end,
    updated_at = now(), updated_by = auth.uid()
   where id = eid;
  select to_jsonb(e) into after from public.eab_admin_events e where e.id = eid;
  if cur.shared or (after->>'shared')::boolean then
    perform public.eab_admin_write_action(case when (after->>'removed')::boolean then 'admin_event_removed' else 'admin_event_changed' end, null,
              'event: ' || left(after->>'title', 80), null, to_jsonb(cur), after, p_device);
  end if;
  return after;
end $$;

-- =====================================================================================================
-- permissions
-- =====================================================================================================
revoke all on function public.eab_broadcast_keep() from public, anon, authenticated;
revoke all on function public.eab_wa_number(text, text), public.eab_news_consent(uuid), public.eab_bc_candidate(public.eab_broadcasts, auth.users),
  public.eab_bc_in_audience(public.eab_broadcasts, uuid), public.eab_bc_json(uuid), public.eab_report_audit(uuid, text, text, jsonb),
  public.eab_report_week(date), public.eab_admin_todo_may(uuid, boolean) from public, anon, authenticated;
-- the main app (signed-in agent)
revoke all on function public.eab_set_my_phone(text) from public, anon;
grant execute on function public.eab_set_my_phone(text) to authenticated;
-- Admin EAB (each function checks the admin role itself)
revoke all on function public.eab_admin_broadcast_save(jsonb, text), public.eab_admin_broadcast_preview(uuid), public.eab_admin_broadcast_queue(uuid, text, text),
  public.eab_admin_broadcast_cancel(uuid, text, text), public.eab_admin_broadcasts(integer), public.eab_admin_broadcast(uuid, text),
  public.eab_admin_broadcast_wa_opened(bigint, text), public.eab_admin_broadcast_claim(uuid, integer, text),
  public.eab_admin_report_settings(), public.eab_admin_report_settings_save(jsonb, text, text), public.eab_admin_reports(integer, text),
  public.eab_admin_report_download(uuid, text), public.eab_admin_report_claim(text, text), public.eab_admin_check_report(text, text),
  public.eab_admin_workspaces(text, text), public.eab_admin_workspace(uuid, text),
  public.eab_admin_todo(), public.eab_admin_task_save(jsonb, text), public.eab_admin_event_save(jsonb, text) from public, anon;
grant execute on function public.eab_admin_broadcast_save(jsonb, text), public.eab_admin_broadcast_preview(uuid), public.eab_admin_broadcast_queue(uuid, text, text),
  public.eab_admin_broadcast_cancel(uuid, text, text), public.eab_admin_broadcasts(integer), public.eab_admin_broadcast(uuid, text),
  public.eab_admin_broadcast_wa_opened(bigint, text), public.eab_admin_broadcast_claim(uuid, integer, text),
  public.eab_admin_report_settings(), public.eab_admin_report_settings_save(jsonb, text, text), public.eab_admin_reports(integer, text),
  public.eab_admin_report_download(uuid, text), public.eab_admin_report_claim(text, text), public.eab_admin_check_report(text, text),
  public.eab_admin_workspaces(text, text), public.eab_admin_workspace(uuid, text),
  public.eab_admin_todo(), public.eab_admin_task_save(jsonb, text), public.eab_admin_event_save(jsonb, text) to authenticated;
-- the Edge Functions' own key only
revoke all on function public.eab_bc_result(bigint, boolean, text, text), public.eab_bc_finish(uuid), public.eab_bc_unclaim(uuid), public.eab_bc_unsubscribe(text),
  public.eab_report_claim_scheduled(timestamptz), public.eab_report_data(uuid), public.eab_report_stored(uuid, text, text, bigint),
  public.eab_report_finished(uuid, text[], text) from public, anon, authenticated;
grant execute on function public.eab_bc_result(bigint, boolean, text, text), public.eab_bc_finish(uuid), public.eab_bc_unclaim(uuid), public.eab_bc_unsubscribe(text),
  public.eab_report_claim_scheduled(timestamptz), public.eab_report_data(uuid), public.eab_report_stored(uuid, text, text, bigint),
  public.eab_report_finished(uuid, text[], text) to service_role;
-- storage-policy helper runs as the signed-in admin
revoke all on function public.eab_report_can_read(text) from public, anon;
grant execute on function public.eab_report_can_read(text) to authenticated;
