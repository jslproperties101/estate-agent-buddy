-- MainForAdmin-D (Stage D): content pushed from Admin EAB to the main app.
--   JoyChange009-Main A8 + A9; JoyChange005-Main Part6 Changes F (Market News), G (order per group), L (announcements),
--   M (force update), N (maintenance mode); JoyChange005-Main Part1 (Admin-pushed Projects + invitation codes).
--
-- Who sees what is decided HERE, never on the phone:
--   * an item is published, not expired, and its audience is 'all', or one of its groups matches the agent,
--     or the agent redeemed an invitation code that contains it;
--   * withdrawn or deleted items disappear (no archive); a later grant is a new grant.
-- Order: the agent's highest-ranked group (lowest priority number) that has an order wins; then the "Everyone"
--   order; then newest first.
-- Language: the phone asks in its language (en / bm / zh); an empty translation falls back to English.
-- Push alerts: push_alert is stored; sending is done later by a server function (Firebase is not set up yet).
--
-- Every admin change goes through eab_admin_* functions (role check, reason required, tamper-proof admin log).
-- Safe to run twice. Rollback: supabase/rollback/20261021200000_mainforadmin_d_rollback.sql
begin;

-- =====================================================================================================
-- D1. shared settings: force update and maintenance mode (A9, Changes M and N)
-- =====================================================================================================
alter table public.eab_settings add column if not exists min_version         text check (min_version is null or min_version ~ '^[0-9]+(\.[0-9]+){0,3}$');
alter table public.eab_settings add column if not exists min_version_mode    text not null default 'soft' check (min_version_mode in ('soft', 'hard'));
alter table public.eab_settings add column if not exists update_url          text check (update_url is null or (update_url ~ '^https://' and char_length(update_url) <= 500));
alter table public.eab_settings add column if not exists maintenance_on      boolean not null default false;
alter table public.eab_settings add column if not exists maintenance_message_en text check (maintenance_message_en is null or char_length(maintenance_message_en) <= 1000);
alter table public.eab_settings add column if not exists maintenance_message_bm text check (maintenance_message_bm is null or char_length(maintenance_message_bm) <= 1000);
alter table public.eab_settings add column if not exists maintenance_message_zh text check (maintenance_message_zh is null or char_length(maintenance_message_zh) <= 1000);
alter table public.eab_settings add column if not exists maintenance_back_at timestamptz;

-- Read by the app at launch and on every sync, signed in or not (maintenance must show even on the sign-in screen).
-- Only public facts: company name, support contact, versions, maintenance.
create or replace function public.eab_public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'company_name', s.company_name, 'support_email', s.support_email, 'business_address', s.business_address,
    'min_version', s.min_version, 'min_version_mode', s.min_version_mode, 'update_url', s.update_url,
    'maintenance_on', s.maintenance_on, 'maintenance_message_en', s.maintenance_message_en,
    'maintenance_message_bm', s.maintenance_message_bm, 'maintenance_message_zh', s.maintenance_message_zh,
    'maintenance_back_at', s.maintenance_back_at, 'at', now())
  from public.eab_settings s where s.id
$$;

-- Same function as stage B, now with the new keys. Only the keys sent are changed.
create or replace function public.eab_admin_set_settings(p_patch jsonb, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  if p_patch ? 'min_version_mode' and coalesce(p_patch->>'min_version_mode', '') not in ('soft', 'hard') then
    raise exception 'min_version_mode must be soft or hard' using errcode = '22023';
  end if;
  select to_jsonb(s) into before from public.eab_settings s where id;
  update public.eab_settings set
    company_name     = case when p_patch ? 'company_name' and nullif(btrim(p_patch->>'company_name'), '') is not null then btrim(p_patch->>'company_name') else company_name end,
    support_email    = case when p_patch ? 'support_email' then nullif(btrim(p_patch->>'support_email'), '') else support_email end,
    business_address = case when p_patch ? 'business_address' then nullif(btrim(p_patch->>'business_address'), '') else business_address end,
    min_version      = case when p_patch ? 'min_version' then nullif(btrim(p_patch->>'min_version'), '') else min_version end,
    min_version_mode = case when p_patch ? 'min_version_mode' then p_patch->>'min_version_mode' else min_version_mode end,
    update_url       = case when p_patch ? 'update_url' then nullif(btrim(p_patch->>'update_url'), '') else update_url end,
    maintenance_on   = case when p_patch ? 'maintenance_on' then coalesce((p_patch->>'maintenance_on')::boolean, false) else maintenance_on end,
    maintenance_message_en = case when p_patch ? 'maintenance_message_en' then nullif(btrim(p_patch->>'maintenance_message_en'), '') else maintenance_message_en end,
    maintenance_message_bm = case when p_patch ? 'maintenance_message_bm' then nullif(btrim(p_patch->>'maintenance_message_bm'), '') else maintenance_message_bm end,
    maintenance_message_zh = case when p_patch ? 'maintenance_message_zh' then nullif(btrim(p_patch->>'maintenance_message_zh'), '') else maintenance_message_zh end,
    maintenance_back_at = case when p_patch ? 'maintenance_back_at' then nullif(p_patch->>'maintenance_back_at', '')::timestamptz else maintenance_back_at end,
    updated_at = now(), updated_by = auth.uid()
   where id;
  select to_jsonb(s) into after from public.eab_settings s where id;
  perform public.eab_admin_write_action('settings_changed', null, 'eab_settings', p_reason, before, after, p_device);
  return after;
end $$;

-- =====================================================================================================
-- D2. audience groups (A8): saved filters with a rank. "Everyone" always exists and ranks last.
-- =====================================================================================================
create table if not exists public.eab_audience_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  filters     jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  priority    integer not null default 100 check (priority between 1 and 1000),   -- 1 = highest rank
  active      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
insert into public.eab_audience_groups (id, name, filters, priority)
  values ('00000000-0000-0000-0000-000000000000', 'Everyone', '{}'::jsonb, 1000) on conflict (id) do nothing;

-- Facts about an agent that filters can use (server side only).
create or replace function public.eab_agent_facts(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare u auth.users; lg text; out jsonb;
begin
  select * into u from auth.users where id = p_user;
  if u.id is null then return null; end if;
  select substr(e.name, 6) into lg from public.eab_usage_events e where e.user_id = u.id and e.kind = 'language' order by e.at desc limit 1;
  if lg is null and to_regclass('public.eab_push_tokens') is not null then   -- push may not be installed on every project
    execute 'select lang from public.eab_push_tokens where user_id = $1 order by updated_at desc limit 1' into lg using u.id;
  end if;
  select jsonb_build_object(
    'email', lower(u.email::text),
    'country', u.raw_user_meta_data->>'country',
    'joined_at', u.created_at,
    'licence_type', (select l.type from public.eab_licences l where l.user_id = u.id),
    'language', lg,
    'platform', (select g.platform from public.eab_login_log g where g.user_id = u.id order by g.seq desc limit 1),
    'app_version', (select g.app_version from public.eab_login_log g where g.user_id = u.id order by g.seq desc limit 1),
    'last_login', (select max(g.happened_at) from public.eab_login_log g where g.user_id = u.id and g.event in ('sign_in', 'app_open')),
    'logins', (select count(*) from public.eab_login_log g where g.user_id = u.id and g.event = 'sign_in'))
  into out;
  return out;
end $$;

-- Does an agent match a group's filters? Every filter given must match (AND). An empty object matches everyone.
-- Keys: user_ids, emails, countries, licence_types, languages, platforms, app_versions (lists);
--       joined_from, joined_to, last_login_from, last_login_to (dates); min_logins (number).
create or replace function public.eab_filters_match(p_filters jsonb, p_facts jsonb, p_user uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  fx jsonb := coalesce(p_facts, '{}'::jsonb);
begin
  if p_facts is null then return false; end if;
  if f ? 'user_ids' and jsonb_array_length(f->'user_ids') > 0 and not (f->'user_ids') ? p_user::text then return false; end if;
  if f ? 'emails' and jsonb_array_length(f->'emails') > 0
     and not exists (select 1 from jsonb_array_elements_text(f->'emails') x where lower(x) = fx->>'email') then return false; end if;
  if f ? 'countries' and jsonb_array_length(f->'countries') > 0 and not coalesce((f->'countries') ? coalesce(fx->>'country', 'Malaysia'), false) then return false; end if;
  if f ? 'licence_types' and jsonb_array_length(f->'licence_types') > 0 and not coalesce((f->'licence_types') ? (fx->>'licence_type'), false) then return false; end if;
  if f ? 'languages' and jsonb_array_length(f->'languages') > 0 and not coalesce((f->'languages') ? coalesce(fx->>'language', 'en'), false) then return false; end if;
  if f ? 'platforms' and jsonb_array_length(f->'platforms') > 0 and not coalesce((f->'platforms') ? (fx->>'platform'), false) then return false; end if;
  if f ? 'app_versions' and jsonb_array_length(f->'app_versions') > 0 and not coalesce((f->'app_versions') ? (fx->>'app_version'), false) then return false; end if;
  if f ? 'joined_from' and (fx->>'joined_at')::timestamptz < (f->>'joined_from')::timestamptz then return false; end if;
  if f ? 'joined_to' and (fx->>'joined_at')::timestamptz > (f->>'joined_to')::timestamptz then return false; end if;
  if f ? 'last_login_from' and coalesce((fx->>'last_login')::timestamptz, '-infinity') < (f->>'last_login_from')::timestamptz then return false; end if;
  if f ? 'last_login_to' and coalesce((fx->>'last_login')::timestamptz, '-infinity') > (f->>'last_login_to')::timestamptz then return false; end if;
  if f ? 'min_logins' and coalesce((fx->>'logins')::integer, 0) < (f->>'min_logins')::integer then return false; end if;
  return true;
end $$;

-- The groups an agent belongs to, best rank first (always ends with Everyone).
create or replace function public.eab_my_groups(p_user uuid) returns table (group_id uuid, priority integer)
language sql stable security definer set search_path = public as $$
  with fx as (select public.eab_agent_facts(p_user) facts)
  select g.id, g.priority from public.eab_audience_groups g, fx
   where g.active and public.eab_filters_match(g.filters, fx.facts, p_user)
   order by g.priority, g.created_at
$$;

-- =====================================================================================================
-- D3. feed items: Market News, pushed Projects, announcements (Changes F, L; Part1 Projects)
-- =====================================================================================================
create table if not exists public.eab_feed_items (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('news', 'project', 'announcement')),
  title_en     text not null check (char_length(title_en) between 1 and 200),
  title_bm     text check (title_bm is null or char_length(title_bm) <= 200),
  title_zh     text check (title_zh is null or char_length(title_zh) <= 200),
  body_en      text check (body_en is null or char_length(body_en) <= 10000),
  body_bm      text check (body_bm is null or char_length(body_bm) <= 10000),
  body_zh      text check (body_zh is null or char_length(body_zh) <= 10000),
  image_url    text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 1000)),
  link_url     text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 1000)),
  pdf_url      text check (pdf_url is null or (pdf_url ~ '^https://' and char_length(pdf_url) <= 1000)),
  push_alert   boolean not null default false,
  display      text check (display is null or display in ('banner', 'popup')),   -- announcements only
  project      jsonb check (project is null or jsonb_typeof(project) = 'object'), -- developer, location, price_from, price_to, launch, status
  audience     text not null default 'all' check (audience in ('all', 'groups', 'codes')),
  status       text not null default 'draft' check (status in ('draft', 'published', 'withdrawn')),
  published_at timestamptz,
  expires_at   timestamptz,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (kind = 'announcement' or display is null),
  check (kind <> 'announcement' or display is not null)
);
create index if not exists eab_feed_items_live on public.eab_feed_items (kind, status, published_at desc);

create table if not exists public.eab_feed_targets (
  item_id  uuid not null references public.eab_feed_items (id) on delete cascade,
  group_id uuid not null references public.eab_audience_groups (id) on delete cascade,
  primary key (item_id, group_id)
);

-- Change G: the order per group (position 1 = first).
create table if not exists public.eab_feed_order (
  group_id uuid not null references public.eab_audience_groups (id) on delete cascade,
  item_id  uuid not null references public.eab_feed_items (id) on delete cascade,
  position integer not null check (position between 1 and 100000),
  primary key (group_id, item_id)
);

-- Invitation codes: one code gives one project or a bundle of them.
create table if not exists public.eab_feed_codes (
  code        text primary key check (code ~ '^[A-Z0-9]{6,20}$'),
  label       text check (label is null or char_length(label) <= 200),
  item_ids    uuid[] not null check (cardinality(item_ids) between 1 and 500),
  active      boolean not null default true,
  expires_at  timestamptz,
  max_uses    integer check (max_uses is null or max_uses >= 1),
  uses        integer not null default 0,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create table if not exists public.eab_feed_code_grants (
  user_id    uuid not null references auth.users (id) on delete cascade,
  item_id    uuid not null references public.eab_feed_items (id) on delete cascade,
  code       text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create table if not exists public.eab_feed_code_attempts (
  user_id uuid not null,
  at      timestamptz not null default now(),
  ok      boolean not null
);
create index if not exists eab_feed_code_attempts_user on public.eab_feed_code_attempts (user_id, at desc);

-- Read / unread per agent (megaphone badge), acknowledged pop-ups, dismissed banners; also the "opened" count (K9).
create table if not exists public.eab_feed_reads (
  user_id         uuid not null references auth.users (id) on delete cascade,
  item_id         uuid not null references public.eab_feed_items (id) on delete cascade,
  opened_at       timestamptz,
  acknowledged_at timestamptz,
  dismissed_at    timestamptz,
  primary key (user_id, item_id)
);

alter table public.eab_audience_groups enable row level security;
alter table public.eab_feed_items enable row level security;
alter table public.eab_feed_targets enable row level security;
alter table public.eab_feed_order enable row level security;
alter table public.eab_feed_codes enable row level security;
alter table public.eab_feed_code_grants enable row level security;
alter table public.eab_feed_code_attempts enable row level security;
alter table public.eab_feed_reads enable row level security;
revoke all on public.eab_audience_groups, public.eab_feed_items, public.eab_feed_targets, public.eab_feed_order,
  public.eab_feed_codes, public.eab_feed_code_grants, public.eab_feed_code_attempts, public.eab_feed_reads from public, anon, authenticated;

-- Can this agent see this item now?
create or replace function public.eab_feed_visible(p_user uuid, i public.eab_feed_items) returns boolean
language sql stable security definer set search_path = public as $$
  select i.status = 'published' and (i.published_at is null or i.published_at <= now()) and (i.expires_at is null or i.expires_at > now())
     and (i.audience = 'all'
          or (i.audience = 'groups' and exists (select 1 from public.eab_feed_targets t join public.eab_my_groups(p_user) g on g.group_id = t.group_id where t.item_id = i.id))
          or exists (select 1 from public.eab_feed_code_grants c where c.user_id = p_user and c.item_id = i.id))
$$;

-- The agent's own feed. p_kind null = all kinds. Newest first unless a group order says otherwise.
create or replace function public.eab_my_feed(p_kind text default null, p_lang text default 'en') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); lg text := case when p_lang in ('en', 'bm', 'zh') then p_lang else 'en' end; best uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not public.eab_account_ok(me) then raise exception 'account not active' using errcode = '42501'; end if;
  -- the best-ranked group that has an order
  select g.group_id into best from public.eab_my_groups(me) g
   where exists (select 1 from public.eab_feed_order o where o.group_id = g.group_id) order by g.priority limit 1;
  return coalesce((
    select jsonb_agg(x.j order by x.pos nulls last, x.pub desc nulls last, x.created desc)
    from (
      select jsonb_build_object(
        'id', i.id, 'kind', i.kind,
        'title', coalesce(nullif(case lg when 'bm' then i.title_bm when 'zh' then i.title_zh else i.title_en end, ''), i.title_en),
        'body', coalesce(nullif(case lg when 'bm' then i.body_bm when 'zh' then i.body_zh else i.body_en end, ''), i.body_en),
        'image_url', i.image_url, 'link_url', i.link_url, 'pdf_url', i.pdf_url, 'display', i.display, 'project', i.project,
        'published_at', coalesce(i.published_at, i.created_at),
        'from_code', exists (select 1 from public.eab_feed_code_grants c where c.user_id = me and c.item_id = i.id),
        'opened_at', r.opened_at, 'acknowledged_at', r.acknowledged_at, 'dismissed_at', r.dismissed_at) j,
        coalesce((select o.position from public.eab_feed_order o where o.group_id = best and o.item_id = i.id),
                 (select o.position + 1000000 from public.eab_feed_order o where o.group_id = '00000000-0000-0000-0000-000000000000' and o.item_id = i.id)) pos,
        i.published_at pub, i.created_at created
      from public.eab_feed_items i
      left join public.eab_feed_reads r on r.user_id = me and r.item_id = i.id
      where (p_kind is null or i.kind = p_kind) and public.eab_feed_visible(me, i)
    ) x), '[]'::jsonb);
end $$;

-- The agent opened a post, acknowledged a pop-up or closed a banner. Only for items the agent can see.
create or replace function public.eab_feed_mark(p_item uuid, p_what text) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); i public.eab_feed_items;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_what not in ('opened', 'acknowledged', 'dismissed') then raise exception 'unknown mark' using errcode = '22023'; end if;
  select * into i from public.eab_feed_items where id = p_item;
  if i.id is null or not public.eab_feed_visible(me, i) then return false; end if;
  insert into public.eab_feed_reads (user_id, item_id, opened_at, acknowledged_at, dismissed_at)
  values (me, p_item, now(), case when p_what = 'acknowledged' then now() end, case when p_what = 'dismissed' then now() end)
  on conflict (user_id, item_id) do update set
    opened_at = coalesce(eab_feed_reads.opened_at, now()),
    acknowledged_at = case when p_what = 'acknowledged' then coalesce(eab_feed_reads.acknowledged_at, now()) else eab_feed_reads.acknowledged_at end,
    dismissed_at = case when p_what = 'dismissed' then coalesce(eab_feed_reads.dismissed_at, now()) else eab_feed_reads.dismissed_at end;
  return true;
end $$;

-- An agent enters an invitation code. Returns how many projects it added. 20 wrong codes an hour, then a wait.
create or replace function public.eab_redeem_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.eab_feed_codes; k text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); n int := 0;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not public.eab_account_ok(me) then raise exception 'account not active' using errcode = '42501'; end if;
  if (select count(*) from public.eab_feed_code_attempts a where a.user_id = me and not a.ok and a.at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  select * into c from public.eab_feed_codes where code = k for update;
  if c.code is null or not c.active or (c.expires_at is not null and c.expires_at <= now()) or (c.max_uses is not null and c.uses >= c.max_uses) then
    insert into public.eab_feed_code_attempts (user_id, ok) values (me, false);
    return jsonb_build_object('ok', false, 'reason', case when c.code is null or not c.active then 'not_found' when c.expires_at is not null and c.expires_at <= now() then 'expired' else 'used_up' end);
  end if;
  insert into public.eab_feed_code_grants (user_id, item_id, code)
    select me, i.id, c.code from public.eab_feed_items i where i.id = any (c.item_ids) and i.kind = 'project'
    on conflict (user_id, item_id) do nothing;
  get diagnostics n = row_count;
  update public.eab_feed_codes set uses = uses + 1 where code = c.code;
  insert into public.eab_feed_code_attempts (user_id, ok) values (me, true);
  return jsonb_build_object('ok', true, 'added', n,
    'visible', (select count(*) from public.eab_feed_items i where i.id = any (c.item_ids) and public.eab_feed_visible(me, i)));
end $$;

-- =====================================================================================================
-- D4. Admin EAB functions (owner / admin write; compliance / viewer read). Every write needs a reason and is logged.
-- =====================================================================================================
create or replace function public.eab_admin_feed_save(p_item jsonb, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb; iid uuid := nullif(p_item->>'id', '')::uuid; g text;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  if iid is not null then select to_jsonb(i) into before from public.eab_feed_items i where id = iid; end if;
  if iid is null or before is null then
    insert into public.eab_feed_items (id, kind, title_en, display, created_by)
      values (coalesce(iid, gen_random_uuid()), p_item->>'kind', btrim(p_item->>'title_en'), nullif(p_item->>'display', ''), auth.uid())
    returning id into iid;
  end if;
  update public.eab_feed_items set
    kind = coalesce(nullif(p_item->>'kind', ''), kind),
    title_en = coalesce(nullif(btrim(p_item->>'title_en'), ''), title_en),
    title_bm = case when p_item ? 'title_bm' then nullif(btrim(p_item->>'title_bm'), '') else title_bm end,
    title_zh = case when p_item ? 'title_zh' then nullif(btrim(p_item->>'title_zh'), '') else title_zh end,
    body_en  = case when p_item ? 'body_en' then nullif(btrim(p_item->>'body_en'), '') else body_en end,
    body_bm  = case when p_item ? 'body_bm' then nullif(btrim(p_item->>'body_bm'), '') else body_bm end,
    body_zh  = case when p_item ? 'body_zh' then nullif(btrim(p_item->>'body_zh'), '') else body_zh end,
    image_url = case when p_item ? 'image_url' then nullif(btrim(p_item->>'image_url'), '') else image_url end,
    link_url  = case when p_item ? 'link_url' then nullif(btrim(p_item->>'link_url'), '') else link_url end,
    pdf_url   = case when p_item ? 'pdf_url' then nullif(btrim(p_item->>'pdf_url'), '') else pdf_url end,
    push_alert = case when p_item ? 'push_alert' then coalesce((p_item->>'push_alert')::boolean, false) else push_alert end,
    display  = case when p_item ? 'display' then nullif(p_item->>'display', '') else display end,
    project  = case when p_item ? 'project' then nullif(p_item->'project', 'null'::jsonb) else project end,
    audience = case when p_item ? 'audience' then p_item->>'audience' else audience end,
    expires_at = case when p_item ? 'expires_at' then nullif(p_item->>'expires_at', '')::timestamptz else expires_at end,
    updated_at = now()
  where id = iid;
  if p_item ? 'group_ids' then
    delete from public.eab_feed_targets where item_id = iid;
    for g in select jsonb_array_elements_text(p_item->'group_ids') loop
      insert into public.eab_feed_targets (item_id, group_id) values (iid, g::uuid) on conflict do nothing;
    end loop;
  end if;
  select to_jsonb(i) || jsonb_build_object('group_ids', (select coalesce(jsonb_agg(t.group_id), '[]'::jsonb) from public.eab_feed_targets t where t.item_id = iid))
    into after from public.eab_feed_items i where id = iid;
  perform public.eab_admin_write_action('feed_saved', null, 'eab_feed_items:' || iid, p_reason, before, after, p_device);
  return after;
end $$;

-- Publish, withdraw (disappears from every agent, no archive) or back to draft.
create or replace function public.eab_admin_feed_set_status(p_item uuid, p_status text, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  if p_status not in ('draft', 'published', 'withdrawn') then raise exception 'unknown status' using errcode = '22023'; end if;
  select to_jsonb(i) into before from public.eab_feed_items i where id = p_item;
  if before is null then raise exception 'item not found' using errcode = 'P0002'; end if;
  update public.eab_feed_items set status = p_status, updated_at = now(),
    published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end
   where id = p_item;
  select to_jsonb(i) into after from public.eab_feed_items i where id = p_item;
  perform public.eab_admin_write_action('feed_' || p_status, null, 'eab_feed_items:' || p_item, p_reason, before, after, p_device);
  return after;
end $$;

-- All items of a kind with their counts: agents who can see it now, opened, acknowledged, dismissed.
create or replace function public.eab_admin_feed_list(p_kind text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object(
      'group_ids', (select coalesce(jsonb_agg(t.group_id), '[]'::jsonb) from public.eab_feed_targets t where t.item_id = i.id),
      'opened', (select count(*) from public.eab_feed_reads r where r.item_id = i.id and r.opened_at is not null),
      'acknowledged', (select count(*) from public.eab_feed_reads r where r.item_id = i.id and r.acknowledged_at is not null),
      'dismissed', (select count(*) from public.eab_feed_reads r where r.item_id = i.id and r.dismissed_at is not null),
      'code_grants', (select count(*) from public.eab_feed_code_grants c where c.item_id = i.id))
    order by i.created_at desc) from public.eab_feed_items i where p_kind is null or i.kind = p_kind), '[]'::jsonb);
end $$;

create or replace function public.eab_admin_group_save(p_group jsonb, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare gid uuid := nullif(p_group->>'id', '')::uuid; before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  if gid = '00000000-0000-0000-0000-000000000000' and (p_group ? 'filters' or p_group ? 'active') then
    raise exception 'Everyone cannot be filtered or switched off' using errcode = '22023';
  end if;
  if p_group ? 'filters' and jsonb_typeof(p_group->'filters') <> 'object' then raise exception 'filters must be an object' using errcode = '22023'; end if;
  if gid is not null then select to_jsonb(g) into before from public.eab_audience_groups g where id = gid; end if;
  if before is null then
    insert into public.eab_audience_groups (id, name, created_by) values (coalesce(gid, gen_random_uuid()), coalesce(nullif(btrim(p_group->>'name'), ''), 'Group'), auth.uid())
    returning id into gid;
  end if;
  update public.eab_audience_groups set
    name = coalesce(nullif(btrim(p_group->>'name'), ''), name),
    filters = case when p_group ? 'filters' then p_group->'filters' else filters end,
    priority = case when p_group ? 'priority' then (p_group->>'priority')::integer else priority end,
    active = case when p_group ? 'active' then (p_group->>'active')::boolean else active end,
    updated_at = now()
  where id = gid;
  select to_jsonb(g) into after from public.eab_audience_groups g where id = gid;
  perform public.eab_admin_write_action('group_saved', null, 'eab_audience_groups:' || gid, p_reason, before, after, p_device);
  return after;
end $$;

-- Groups with how many agents match each one now.
create or replace function public.eab_admin_group_list() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return coalesce((select jsonb_agg(to_jsonb(g) || jsonb_build_object('agents',
      (select count(*) from auth.users u where public.eab_filters_match(g.filters, public.eab_agent_facts(u.id), u.id)))
    order by g.priority, g.created_at) from public.eab_audience_groups g), '[]'::jsonb);
end $$;

-- Sets the full order of a group (items not listed have no position in that group).
create or replace function public.eab_admin_feed_order_set(p_group uuid, p_items uuid[], p_reason text, p_device text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare before jsonb; n int := 0; k int;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  if not exists (select 1 from public.eab_audience_groups where id = p_group) then raise exception 'group not found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(item_id order by position), '[]'::jsonb) into before from public.eab_feed_order where group_id = p_group;
  delete from public.eab_feed_order where group_id = p_group;
  for k in 1 .. coalesce(array_length(p_items, 1), 0) loop
    insert into public.eab_feed_order (group_id, item_id, position) values (p_group, p_items[k], k) on conflict do nothing;
    n := n + 1;
  end loop;
  perform public.eab_admin_write_action('feed_order_set', null, 'eab_audience_groups:' || p_group, p_reason,
    jsonb_build_object('order', before), jsonb_build_object('order', to_jsonb(p_items)), p_device);
  return n;
end $$;

-- A new invitation code (10 letters and digits, no look-alikes) for one or more projects.
create or replace function public.eab_admin_code_create(p_label text, p_items uuid[], p_expires_at timestamptz, p_max_uses integer,
  p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k text; alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; i int; c public.eab_feed_codes;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  if coalesce(cardinality(p_items), 0) = 0 then raise exception 'choose at least one project' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_items) x where not exists (select 1 from public.eab_feed_items f where f.id = x and f.kind = 'project')) then
    raise exception 'codes are for projects only' using errcode = '22023';
  end if;
  loop
    b := gen_random_bytes(10); k := '';
    for i in 0 .. 9 loop k := k || substr(alphabet, (get_byte(b, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.eab_feed_codes where code = k);
  end loop;
  insert into public.eab_feed_codes (code, label, item_ids, expires_at, max_uses, created_by)
    values (k, nullif(btrim(p_label), ''), p_items, p_expires_at, p_max_uses, auth.uid()) returning * into c;
  perform public.eab_admin_write_action('code_created', null, 'eab_feed_codes:' || k, p_reason, null, to_jsonb(c), p_device);
  return to_jsonb(c);
end $$;

create or replace function public.eab_admin_code_disable(p_code text, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select to_jsonb(c) into before from public.eab_feed_codes c where code = p_code;
  if before is null then raise exception 'code not found' using errcode = 'P0002'; end if;
  update public.eab_feed_codes set active = false where code = p_code;
  select to_jsonb(c) into after from public.eab_feed_codes c where code = p_code;
  perform public.eab_admin_write_action('code_disabled', null, 'eab_feed_codes:' || p_code, p_reason, before, after, p_device);
  return after;
end $$;

-- Removes a project an agent got through a code (the code itself stays). Also used when Admin stops sharing with one agent.
create or replace function public.eab_admin_code_revoke(p_user uuid, p_item uuid, p_reason text, p_device text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare before jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select to_jsonb(c) into before from public.eab_feed_code_grants c where user_id = p_user and item_id = p_item;
  if before is null then return false; end if;
  delete from public.eab_feed_code_grants where user_id = p_user and item_id = p_item;
  perform public.eab_admin_write_action('code_grant_revoked', p_user, 'eab_feed_items:' || p_item, p_reason, before, null, p_device);
  return true;
end $$;

create or replace function public.eab_admin_code_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('agents', (select count(distinct g.user_id) from public.eab_feed_code_grants g where g.code = c.code))
    order by c.created_at desc) from public.eab_feed_codes c), '[]'::jsonb);
end $$;

-- =====================================================================================================
-- D5. permissions
-- =====================================================================================================
revoke all on function public.eab_agent_facts(uuid), public.eab_filters_match(jsonb, jsonb, uuid), public.eab_my_groups(uuid),
  public.eab_feed_visible(uuid, public.eab_feed_items) from public, anon, authenticated;
revoke all on function public.eab_public_settings(), public.eab_my_feed(text, text), public.eab_feed_mark(uuid, text),
  public.eab_redeem_code(text), public.eab_admin_feed_save(jsonb, text, text), public.eab_admin_feed_set_status(uuid, text, text, text),
  public.eab_admin_feed_list(text), public.eab_admin_group_save(jsonb, text, text), public.eab_admin_group_list(),
  public.eab_admin_feed_order_set(uuid, uuid[], text, text),
  public.eab_admin_code_create(text, uuid[], timestamptz, integer, text, text), public.eab_admin_code_disable(text, text, text),
  public.eab_admin_code_revoke(uuid, uuid, text, text), public.eab_admin_code_list() from public, anon;
grant execute on function public.eab_public_settings() to anon, authenticated;
grant execute on function public.eab_my_feed(text, text), public.eab_feed_mark(uuid, text), public.eab_redeem_code(text),
  public.eab_admin_feed_save(jsonb, text, text), public.eab_admin_feed_set_status(uuid, text, text, text),
  public.eab_admin_feed_list(text), public.eab_admin_group_save(jsonb, text, text), public.eab_admin_group_list(),
  public.eab_admin_feed_order_set(uuid, uuid[], text, text),
  public.eab_admin_code_create(text, uuid[], timestamptz, integer, text, text), public.eab_admin_code_disable(text, text, text),
  public.eab_admin_code_revoke(uuid, uuid, text, text), public.eab_admin_code_list() to authenticated;

commit;
