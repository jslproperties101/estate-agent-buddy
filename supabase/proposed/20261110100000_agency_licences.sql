-- Batch 5 part 2 (10 Nov 2026): agency licences, sold OUTSIDE the Android app (Google Play rules: Malaysia is not in Google's
-- billing-choice programmes, so FPX and card are never offered or mentioned inside the Android app).
-- SANDBOX / TEST MODE ONLY. PROPOSED: run on the TEST project (EAB-QA-Test) first; never on production without the owner's
-- approval. Needs 20261028000000_billing_sandbox.sql and 20261109100000_batch5_news_gate_play_events.sql first (and the
-- Admin EAB foundation for eab_admin_guard / eab_admin_write_action). Safe to run more than once.
-- Rollback: 20261110100000_agency_licences_rollback.sql
--
-- In plain words (Joe, 10 Nov 2026: both ways to charge, both ways to pay):
--  * An agency (a team workspace) can hold ONE licence. It covers Pro for the agents who hold a seat in it.
--      seats   priced per agent: the agency buys N seats (monthly or yearly)
--      agency  one price for the whole agency, covering up to a set number of agents
--  * Two ways to pay, both outside the app:
--      checkout  the agency owner or an admin picks a plan on the website (laptop) and pays by FPX (Billplz) or card (Stripe)
--      invoice   the platform owner (Joe, in Admin EAB) raises an invoice; it carries an FPX link and a card link, or it is
--                marked paid by hand when the agency pays by bank transfer
--    Both are one payment for one period (30 or 365 days), added to the end of the current period. Nothing renews by itself.
--  * Every payment goes through an invoice row first (the checkout makes one too), so the amount the provider reports is
--    always checked against the amount this database asked for, and every payment applies once.
--  * Seats: when a payment is applied, empty seats are filled with the agency's members (owner and admins first). The owner
--    or an admin can then move seats between members. Prices are PLACEHOLDERS until Joe sets them (Admin EAB).
begin;

-- ---------------------------------------------------------------------------------------------- prices (owner sets them)
create table if not exists public.eab_agency_prices (
  plan           text primary key check (plan in ('agency_seat_monthly', 'agency_seat_yearly', 'agency_monthly', 'agency_yearly')),
  style          text not null check (style in ('seats', 'agency')),
  amount_sen     integer not null check (amount_sen between 100 and 100000000),  -- per seat ('seats') or for the agency ('agency')
  days           integer not null check (days in (30, 365)),
  seats_included integer check (seats_included between 1 and 500),               -- 'agency' only: how many agents it covers
  active         boolean not null default true,
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  check ((style = 'agency') = (seats_included is not null)),
  check (style = case when plan like 'agency\_seat\_%' then 'seats' else 'agency' end),
  check (days = case when plan like '%\_yearly' then 365 else 30 end)
);
-- PLACEHOLDER prices (sandbox only), to be replaced by Joe before anything is sold.
insert into public.eab_agency_prices (plan, style, amount_sen, days, seats_included) values
  ('agency_seat_monthly', 'seats', 4900, 30, null), ('agency_seat_yearly', 'seats', 49000, 365, null),
  ('agency_monthly', 'agency', 39900, 30, 15), ('agency_yearly', 'agency', 399000, 365, 15)
on conflict (plan) do nothing;
alter table public.eab_agency_prices enable row level security;
revoke all on public.eab_agency_prices from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- licences, seats, invoices
create table if not exists public.eab_agency_licences (
  workspace_id  uuid primary key references public.eab_workspaces (id) on delete cascade,
  plan          text not null references public.eab_agency_prices (plan),
  style         text not null check (style in ('seats', 'agency')),
  seats         integer not null check (seats between 1 and 500),
  status        text not null check (status in ('active', 'canceled', 'expired')),
  provider      text not null check (provider in ('fpx', 'stripe', 'manual')),
  provider_ref  text,
  env           text not null check (env in ('sandbox', 'live')),
  period_end    timestamptz not null,
  last_event_at timestamptz,
  updated_at    timestamptz not null default now()
);
create table if not exists public.eab_agency_seats (
  workspace_id uuid not null references public.eab_workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  assigned_by  uuid,
  assigned_at  timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create sequence if not exists public.eab_agency_invoice_no;
create table if not exists public.eab_agency_invoices (
  id                uuid primary key default gen_random_uuid(),
  no                text not null unique,
  workspace_id      uuid not null references public.eab_workspaces (id) on delete restrict,
  origin            text not null check (origin in ('checkout', 'invoice')),
  plan              text not null references public.eab_agency_prices (plan),
  seats             integer not null check (seats between 1 and 500),
  amount_sen        integer not null check (amount_sen >= 100),
  list_amount_sen   integer not null check (list_amount_sen >= 100),   -- what the price list said; differs only on an owner's invoice
  days              integer not null check (days in (30, 365)),
  env               text not null check (env in ('sandbox', 'live')),
  status            text not null default 'open' check (status in ('open', 'paid', 'void')),
  pay_token         text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  billplz_bill_id   text,
  fpx_url           text check (fpx_url is null or fpx_url ~ '^https://'),
  stripe_session_id text,
  bill_to           text check (bill_to is null or length(bill_to) <= 300),
  note              text check (note is null or length(note) <= 500),
  created_by        uuid,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  paid_via          text check (paid_via in ('fpx', 'stripe', 'manual')),
  paid_ref          text,
  voided_at         timestamptz,
  void_reason       text
);
create index if not exists eab_agency_invoices_ws_idx on public.eab_agency_invoices (workspace_id, created_at desc);
-- Every provider event once; also the payments that could not be applied (wrong amount, a void or already-paid invoice),
-- so the owner can see and refund them.
create table if not exists public.eab_agency_events (
  id          bigserial primary key,
  provider    text not null check (provider in ('fpx', 'stripe', 'manual')),
  event_id    text not null,
  invoice_id  uuid,
  amount_sen  integer,
  env         text not null check (env in ('sandbox', 'live')),
  result      text not null,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);
alter table public.eab_agency_licences enable row level security;
alter table public.eab_agency_seats enable row level security;
alter table public.eab_agency_invoices enable row level security;
alter table public.eab_agency_events enable row level security;
revoke all on public.eab_agency_licences, public.eab_agency_seats, public.eab_agency_invoices, public.eab_agency_events from public, anon, authenticated;
revoke all on sequence public.eab_agency_invoice_no from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- helpers
create or replace function public.eab_agency_live() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select s.live from public.eab_billing_settings s where s.id), false)
$$;
revoke all on function public.eab_agency_live() from public, anon, authenticated;

/** Is this licence in force now? Same rules as a personal plan: active until the end plus 7 days' grace; cancelled until the end. */
create or replace function public.eab_agency_in_force(l public.eab_agency_licences) returns boolean language sql stable security definer set search_path = public as $$
  select case l.status when 'active' then l.period_end + interval '7 days' > now() when 'canceled' then l.period_end > now() else false end
     and (not public.eab_agency_live() or l.env = 'live')
$$;
revoke all on function public.eab_agency_in_force(public.eab_agency_licences) from public, anon, authenticated;

/** Does an agency licence cover this agent now? A seat in a licence in force, in a workspace the agent is still an active member of. */
create or replace function public.eab_agency_covers(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.eab_agency_seats s
      join public.eab_agency_licences l on l.workspace_id = s.workspace_id
      join public.eab_members m on m.workspace_id = s.workspace_id and m.user_id = s.user_id and m.active
     where s.user_id = p_user and public.eab_agency_in_force(l))
$$;
revoke all on function public.eab_agency_covers(uuid) from public, anon, authenticated;

/** Fill empty seats with active members (owner, admins, team leaders, agents; earliest first) and drop seats above the limit. */
create or replace function public.eab_agency_fill_seats(p_ws uuid) returns integer language plpgsql security definer set search_path = public as $$
declare lim integer; n integer;
begin
  select seats into lim from public.eab_agency_licences where workspace_id = p_ws;
  if lim is null then return 0; end if;
  delete from public.eab_agency_seats s using public.eab_members m
   where s.workspace_id = p_ws and m.workspace_id = s.workspace_id and m.user_id = s.user_id and not m.active;
  delete from public.eab_agency_seats where workspace_id = p_ws and user_id in (
    select user_id from public.eab_agency_seats where workspace_id = p_ws order by assigned_at desc, user_id
     limit greatest(0, (select count(*) from public.eab_agency_seats where workspace_id = p_ws) - lim));
  insert into public.eab_agency_seats (workspace_id, user_id, assigned_by)
  select p_ws, m.user_id, null from public.eab_members m
   where m.workspace_id = p_ws and m.active and m.role <> 'limited'
     and not exists (select 1 from public.eab_agency_seats s where s.workspace_id = p_ws and s.user_id = m.user_id)
   order by array_position(array['owner', 'admin', 'team_leader', 'agent'], m.role), m.created_at, m.user_id
   limit greatest(0, lim - (select count(*) from public.eab_agency_seats where workspace_id = p_ws));
  select count(*) into n from public.eab_agency_seats where workspace_id = p_ws;
  return n;
end $$;
revoke all on function public.eab_agency_fill_seats(uuid) from public, anon, authenticated;

/** A new invoice row (both ways of paying start here). Amount from the price list unless the owner gives one. */
create or replace function public.eab_agency_new_invoice(p_ws uuid, p_origin text, p_plan text, p_seats integer, p_amount_sen integer,
  p_env text, p_bill_to text, p_note text, p_by uuid) returns public.eab_agency_invoices
language plpgsql security definer set search_path = public as $$
declare pr public.eab_agency_prices; n integer; list integer; inv public.eab_agency_invoices;
begin
  if not exists (select 1 from public.eab_workspaces where id = p_ws) then raise exception 'unknown agency' using errcode = '22023'; end if;
  select * into pr from public.eab_agency_prices where plan = p_plan;
  if not found or not pr.active then raise exception 'this plan is not for sale' using errcode = '22023'; end if;
  if p_env not in ('sandbox', 'live') then raise exception 'bad env' using errcode = '22023'; end if;
  n := case pr.style when 'agency' then pr.seats_included else p_seats end;
  if n is null or n < 1 or n > 500 then raise exception 'seats must be 1 to 500' using errcode = '22023'; end if;
  list := pr.amount_sen * (case pr.style when 'seats' then n else 1 end);
  insert into public.eab_agency_invoices (no, workspace_id, origin, plan, seats, amount_sen, list_amount_sen, days, env, bill_to, note, created_by)
  values ('AGI-' || lpad(nextval('public.eab_agency_invoice_no')::text, 5, '0'), p_ws, p_origin, p_plan, n, coalesce(p_amount_sen, list), list,
          pr.days, p_env, nullif(btrim(coalesce(p_bill_to, '')), ''), nullif(btrim(coalesce(p_note, '')), ''), p_by)
  returning * into inv;
  return inv;
end $$;
revoke all on function public.eab_agency_new_invoice(uuid, text, text, integer, integer, text, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- the billing server (service key)
/** The caller's role in the agency (billing server: only an owner or admin may buy for it). */
create or replace function public.eab_agency_member_role(p_ws uuid, p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select role from public.eab_members where workspace_id = p_ws and user_id = p_user and active
$$;
/** Website checkout by the agency owner or an admin: makes the invoice the payment will be checked against. */
create or replace function public.eab_agency_open_checkout(p_ws uuid, p_user uuid, p_plan text, p_seats integer, p_env text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv public.eab_agency_invoices; used integer;
begin
  if coalesce(public.eab_agency_member_role(p_ws, p_user), '') not in ('owner', 'admin') then raise exception 'only the agency owner or an admin can buy' using errcode = '42501'; end if;
  select count(*) into used from public.eab_agency_seats where workspace_id = p_ws;
  inv := public.eab_agency_new_invoice(p_ws, 'checkout', p_plan, p_seats, null, p_env, null, null, p_user);
  return jsonb_build_object('id', inv.id, 'no', inv.no, 'plan', inv.plan, 'seats', inv.seats, 'amount_sen', inv.amount_sen, 'days', inv.days,
    'pay_token', inv.pay_token, 'workspace', (select name from public.eab_workspaces where id = p_ws), 'seats_in_use', used);
end $$;
/** One invoice, for the billing server (webhook, pay link). With p_token: only when the token matches (the public card link). */
create or replace function public.eab_agency_invoice_get(p_id uuid, p_token text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(i) - 'pay_token' || jsonb_build_object('workspace', w.name)
    from public.eab_agency_invoices i join public.eab_workspaces w on w.id = i.workspace_id
   where i.id = p_id and (p_token is null or i.pay_token = p_token)
$$;
create or replace function public.eab_agency_invoice_links(p_id uuid, p_bill_id text, p_fpx_url text, p_session_id text) returns void
language sql security definer set search_path = public as $$
  update public.eab_agency_invoices set billplz_bill_id = coalesce(p_bill_id, billplz_bill_id), fpx_url = coalesce(p_fpx_url, fpx_url),
         stripe_session_id = coalesce(p_session_id, stripe_session_id)
   where id = p_id and status = 'open'
$$;

/**
 * One payment for one invoice (FPX, card, or marked paid by the owner). Applied once per provider event. The amount must be
 * exactly the invoice's. A payment for a void or already-paid invoice is recorded but changes nothing (the owner refunds it).
 * Answers: applied, duplicate, unknown-invoice, wrong-amount, void-invoice, already-paid.
 */
create or replace function public.eab_agency_apply(p_provider text, p_event_id text, p_invoice uuid, p_env text, p_ref text, p_amount_sen integer, p_event_at timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare inv public.eab_agency_invoices; cur public.eab_agency_licences; res text; n integer; newend timestamptz;
begin
  if p_provider not in ('fpx', 'stripe', 'manual') or coalesce(p_event_id, '') = '' or p_env not in ('sandbox', 'live') then raise exception 'bad agency payment'; end if;
  insert into public.eab_agency_events (provider, event_id, invoice_id, amount_sen, env, result) values (p_provider, p_event_id, p_invoice, p_amount_sen, p_env, 'received')
  on conflict (provider, event_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return 'duplicate'; end if;
  select * into inv from public.eab_agency_invoices where id = p_invoice for update;
  if not found then res := 'unknown-invoice';
  elsif inv.status = 'void' then res := 'void-invoice';
  elsif inv.status = 'paid' then res := 'already-paid';
  elsif p_amount_sen is distinct from inv.amount_sen then res := 'wrong-amount';
  else
    update public.eab_agency_invoices set status = 'paid', paid_at = coalesce(p_event_at, now()), paid_via = p_provider, paid_ref = p_ref where id = inv.id;
    select * into cur from public.eab_agency_licences where workspace_id = inv.workspace_id for update;
    -- a period still running (or in grace) is extended; otherwise the new period starts now
    newend := greatest(case when found and cur.status <> 'expired' then cur.period_end else now() end, now()) + make_interval(days => inv.days);
    insert into public.eab_agency_licences as l (workspace_id, plan, style, seats, status, provider, provider_ref, env, period_end, last_event_at, updated_at)
    values (inv.workspace_id, inv.plan, (select style from public.eab_agency_prices where plan = inv.plan), inv.seats, 'active', p_provider, p_ref, p_env,
            newend, coalesce(p_event_at, now()), now())
    on conflict (workspace_id) do update set plan = excluded.plan, style = excluded.style, seats = excluded.seats, status = 'active',
      provider = excluded.provider, provider_ref = excluded.provider_ref, env = excluded.env, period_end = excluded.period_end,
      last_event_at = excluded.last_event_at, updated_at = now();
    perform public.eab_agency_fill_seats(inv.workspace_id);
    res := 'applied';
  end if;
  update public.eab_agency_events set result = res where provider = p_provider and event_id = p_event_id;
  return res;
end $$;
revoke all on function public.eab_agency_member_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.eab_agency_open_checkout(uuid, uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.eab_agency_invoice_get(uuid, text) from public, anon, authenticated;
revoke all on function public.eab_agency_invoice_links(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.eab_agency_apply(text, text, uuid, text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.eab_agency_member_role(uuid, uuid) to service_role;
grant execute on function public.eab_agency_open_checkout(uuid, uuid, text, integer, text) to service_role;
grant execute on function public.eab_agency_invoice_get(uuid, text) to service_role;
grant execute on function public.eab_agency_invoice_links(uuid, text, text, text) to service_role;
grant execute on function public.eab_agency_apply(text, text, uuid, text, text, integer, timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------- the agency (signed-in members)
/** Prices on sale, for the website's checkout. */
create or replace function public.eab_agency_price_list() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('plan', plan, 'style', style, 'amount_sen', amount_sen, 'days', days, 'seats_included', seats_included) order by plan), '[]')
    from public.eab_agency_prices where active and auth.uid() is not null
$$;
revoke all on function public.eab_agency_price_list() from public, anon;
grant execute on function public.eab_agency_price_list() to authenticated;

/**
 * The agency's licence as this member may see it. Every member: whether the licence is in force, until when, and whether
 * they hold a seat. The owner and admins also: who holds the seats, the members, and the open invoices with their pay links.
 */
create or replace function public.eab_my_agency(p_ws uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r text; l public.eab_agency_licences; out jsonb; boss boolean;
begin
  r := public.eab_agency_member_role(p_ws, me);
  if r is null then raise exception 'not a member of this agency' using errcode = '42501'; end if;
  boss := r in ('owner', 'admin');
  select * into l from public.eab_agency_licences where workspace_id = p_ws;
  out := jsonb_build_object('role', r, 'licence', case when l.workspace_id is null then null else jsonb_build_object(
      'plan', l.plan, 'style', l.style, 'seats', l.seats, 'status', l.status, 'env', l.env, 'period_end', l.period_end,
      'provider', l.provider, 'in_force', public.eab_agency_in_force(l)) end,
    'my_seat', exists (select 1 from public.eab_agency_seats where workspace_id = p_ws and user_id = me),
    'seats_used', (select count(*) from public.eab_agency_seats where workspace_id = p_ws));
  if boss then
    out := out || jsonb_build_object(
      'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', m.email, 'role', m.role,
                   'seat', exists (select 1 from public.eab_agency_seats s where s.workspace_id = p_ws and s.user_id = m.user_id)) order by m.created_at, m.user_id)
                 from public.eab_members m where m.workspace_id = p_ws and m.active), '[]'),
      'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'no', i.no, 'plan', i.plan, 'seats', i.seats, 'amount_sen', i.amount_sen,
                   'days', i.days, 'status', i.status, 'created_at', i.created_at, 'paid_at', i.paid_at, 'origin', i.origin,
                   'fpx_url', case when i.status = 'open' then i.fpx_url end, 'pay_token', case when i.status = 'open' then i.pay_token end) order by i.created_at desc)
                 from (select * from public.eab_agency_invoices where workspace_id = p_ws and (origin = 'invoice' or status = 'paid') order by created_at desc limit 20) i), '[]'));
  end if;
  return out;
end $$;
revoke all on function public.eab_my_agency(uuid) from public, anon;
grant execute on function public.eab_my_agency(uuid) to authenticated;

/** The agency owner or an admin gives a seat to a member, or takes it back. */
create or replace function public.eab_agency_seat_set(p_ws uuid, p_user uuid, p_on boolean) returns integer language plpgsql security definer set search_path = public as $$
declare lim integer; used integer;
begin
  if coalesce(public.eab_agency_member_role(p_ws, auth.uid()), '') not in ('owner', 'admin') then raise exception 'only the agency owner or an admin can change seats' using errcode = '42501'; end if;
  perform 1 from public.eab_agency_licences where workspace_id = p_ws for update;
  select seats into lim from public.eab_agency_licences where workspace_id = p_ws;
  if lim is null then raise exception 'this agency has no licence' using errcode = '22023'; end if;
  if p_on then
    if coalesce(public.eab_agency_member_role(p_ws, p_user), 'limited') = 'limited' then raise exception 'not a member who can hold a seat' using errcode = '22023'; end if;
    if not exists (select 1 from public.eab_agency_seats where workspace_id = p_ws and user_id = p_user) then
      select count(*) into used from public.eab_agency_seats where workspace_id = p_ws;
      if used >= lim then raise exception 'all seats are in use' using errcode = '22023'; end if;
      insert into public.eab_agency_seats (workspace_id, user_id, assigned_by) values (p_ws, p_user, auth.uid());
    end if;
  else
    delete from public.eab_agency_seats where workspace_id = p_ws and user_id = p_user;
  end if;
  return (select count(*) from public.eab_agency_seats where workspace_id = p_ws);
end $$;
revoke all on function public.eab_agency_seat_set(uuid, uuid, boolean) from public, anon;
grant execute on function public.eab_agency_seat_set(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------- the platform owner (Admin EAB)
create or replace function public.eab_admin_agency_prices() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  return coalesce((select jsonb_agg(to_jsonb(p) order by p.plan) from public.eab_agency_prices p), '[]');
end $$;
create or replace function public.eab_admin_agency_price_set(p_plan text, p_amount_sen integer, p_seats_included integer, p_active boolean, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner']);
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason of at least 5 characters is required' using errcode = '22023'; end if;
  select to_jsonb(p) into before from public.eab_agency_prices p where plan = p_plan;
  if before is null then raise exception 'unknown plan' using errcode = '22023'; end if;
  update public.eab_agency_prices set amount_sen = coalesce(p_amount_sen, amount_sen),
         seats_included = case when style = 'agency' then coalesce(p_seats_included, seats_included) else null end,
         active = coalesce(p_active, active), updated_at = now(), updated_by = auth.uid()
   where plan = p_plan returning to_jsonb(eab_agency_prices.*) into after;
  perform public.eab_admin_write_action('agency_price_set', null, p_plan, btrim(p_reason), before, after, p_device);
  return after;
end $$;
create or replace function public.eab_admin_agency_invoices(p_status text default null, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select i.id, i.no, i.workspace_id, w.name as workspace, i.origin, i.plan, i.seats, i.amount_sen, i.list_amount_sen, i.days, i.env, i.status,
             i.fpx_url, i.pay_token, i.bill_to, i.note, i.created_at, i.paid_at, i.paid_via, i.paid_ref, i.voided_at, i.void_reason,
             (select l.period_end from public.eab_agency_licences l where l.workspace_id = i.workspace_id) as licence_end
        from public.eab_agency_invoices i join public.eab_workspaces w on w.id = i.workspace_id
       where p_status is null or i.status = p_status
       order by i.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]');
end $$;
/** Payments that were received but not applied (wrong amount, void or already-paid invoice): the owner refunds these. */
create or replace function public.eab_admin_agency_problems() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.received_at desc) from public.eab_agency_events e where e.result not in ('applied', 'received')), '[]');
end $$;
/** The owner raises an invoice (called through the billing server, which then adds the FPX link). */
create or replace function public.eab_admin_agency_invoice_create(p_ws uuid, p_plan text, p_seats integer, p_amount_sen integer, p_env text,
  p_bill_to text, p_note text, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv public.eab_agency_invoices;
begin
  perform public.eab_admin_guard(array['owner']);
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason of at least 5 characters is required' using errcode = '22023'; end if;
  if p_amount_sen is not null and (p_amount_sen < 100 or p_amount_sen > 100000000) then raise exception 'amount must be RM1 or more' using errcode = '22023'; end if;
  inv := public.eab_agency_new_invoice(p_ws, 'invoice', p_plan, p_seats, p_amount_sen, p_env, p_bill_to, p_note, auth.uid());
  perform public.eab_admin_write_action('agency_invoice_create', null, inv.no, btrim(p_reason), null, to_jsonb(inv) - 'pay_token', p_device);
  return to_jsonb(inv) || jsonb_build_object('workspace', (select name from public.eab_workspaces where id = p_ws));
end $$;
create or replace function public.eab_admin_agency_invoice_void(p_id uuid, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner']);
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason of at least 5 characters is required' using errcode = '22023'; end if;
  select to_jsonb(i) - 'pay_token' into before from public.eab_agency_invoices i where id = p_id for update;
  if before is null then raise exception 'unknown invoice' using errcode = '22023'; end if;
  if before->>'status' <> 'open' then raise exception 'only an open invoice can be voided' using errcode = '22023'; end if;
  update public.eab_agency_invoices set status = 'void', voided_at = now(), void_reason = btrim(p_reason) where id = p_id
  returning to_jsonb(eab_agency_invoices.*) - 'pay_token' into after;
  perform public.eab_admin_write_action('agency_invoice_void', null, after->>'no', btrim(p_reason), before, after, p_device);
  return after;
end $$;
/** The agency paid by bank transfer: the owner marks the invoice paid (applied like any payment, once). */
create or replace function public.eab_admin_agency_invoice_mark_paid(p_id uuid, p_ref text, p_reason text, p_device text default null) returns text
language plpgsql security definer set search_path = public as $$
declare inv public.eab_agency_invoices; res text;
begin
  perform public.eab_admin_guard(array['owner']);
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason of at least 5 characters is required' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_ref, ''))) < 3 then raise exception 'the bank reference is required' using errcode = '22023'; end if;
  select * into inv from public.eab_agency_invoices where id = p_id;
  if not found then raise exception 'unknown invoice' using errcode = '22023'; end if;
  res := public.eab_agency_apply('manual', 'manual:' || inv.id, inv.id, inv.env, btrim(p_ref), inv.amount_sen, now());
  perform public.eab_admin_write_action('agency_invoice_mark_paid', null, inv.no, btrim(p_reason), to_jsonb(inv) - 'pay_token',
    jsonb_build_object('result', res, 'ref', btrim(p_ref)), p_device);
  return res;
end $$;
revoke all on function public.eab_admin_agency_prices() from public, anon;
revoke all on function public.eab_admin_agency_price_set(text, integer, integer, boolean, text, text) from public, anon;
revoke all on function public.eab_admin_agency_invoices(text, integer) from public, anon;
revoke all on function public.eab_admin_agency_problems() from public, anon;
revoke all on function public.eab_admin_agency_invoice_create(uuid, text, integer, integer, text, text, text, text, text) from public, anon;
revoke all on function public.eab_admin_agency_invoice_void(uuid, text, text) from public, anon;
revoke all on function public.eab_admin_agency_invoice_mark_paid(uuid, text, text, text) from public, anon;
grant execute on function public.eab_admin_agency_prices() to authenticated;
grant execute on function public.eab_admin_agency_price_set(text, integer, integer, boolean, text, text) to authenticated;
grant execute on function public.eab_admin_agency_invoices(text, integer) to authenticated;
grant execute on function public.eab_admin_agency_problems() to authenticated;
grant execute on function public.eab_admin_agency_invoice_create(uuid, text, integer, integer, text, text, text, text, text) to authenticated;
grant execute on function public.eab_admin_agency_invoice_void(uuid, text, text) to authenticated;
grant execute on function public.eab_admin_agency_invoice_mark_paid(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------- Pro through the agency
-- eab_billing_has (Batch 5) and eab_my_billing (billing sandbox) again, unchanged except that an agency seat now counts as Pro.
create or replace function public.eab_billing_has(p_user uuid, p_product text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case e.status
             when 'trialing' then coalesce(e.trial_end, e.period_end) > now()
             when 'active'   then e.period_end is not null and e.period_end + interval '7 days' > now()
             when 'past_due' then e.period_end is not null and e.period_end + interval '7 days' > now()
             when 'canceled' then e.period_end is not null and e.period_end > now()
             else false end
      from public.eab_billing_entitlements e
     where e.user_id = p_user and e.product = p_product
       and (not coalesce((select s.live from public.eab_billing_settings s where s.id), false) or e.env = 'live')), false)
  or (p_product = 'pro' and public.eab_agency_covers(p_user))
$$;
revoke all on function public.eab_billing_has(uuid, text) from public, anon, authenticated;

create or replace function public.eab_my_billing()
returns table (product text, plan_id text, status text, provider text, env text, trial_end timestamptz, period_end timestamptz, cancel_at_period_end boolean)
language sql stable security definer set search_path = public as $$
  select e.product, e.plan_id, e.status, e.provider, e.env, e.trial_end, e.period_end, e.cancel_at_period_end
    from public.eab_billing_entitlements e
   where e.user_id = auth.uid()
  union all
  -- an agency seat: Pro, provider 'agency', until the licence's end (a one-time period: it does not renew by itself)
  select 'pro', l.plan, l.status, 'agency', l.env, null, l.period_end, true
    from public.eab_agency_seats s
    join public.eab_agency_licences l on l.workspace_id = s.workspace_id
    join public.eab_members m on m.workspace_id = s.workspace_id and m.user_id = s.user_id and m.active
   where s.user_id = auth.uid()
$$;
revoke all on function public.eab_my_billing() from public, anon;
grant execute on function public.eab_my_billing() to authenticated;

commit;
