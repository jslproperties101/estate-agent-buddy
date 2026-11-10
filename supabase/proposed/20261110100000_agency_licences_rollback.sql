-- Rollback of 20261110100000_agency_licences.sql. Puts eab_billing_has and eab_my_billing back as Batch 5 / the billing
-- sandbox left them, then removes the agency tables and functions. Licences, seats, invoices and the payment log are LOST:
-- export them first (Admin EAB → Company Money → Agency) if anything was paid.
begin;
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
$$;
revoke all on function public.eab_billing_has(uuid, text) from public, anon, authenticated;
create or replace function public.eab_my_billing()
returns table (product text, plan_id text, status text, provider text, env text, trial_end timestamptz, period_end timestamptz, cancel_at_period_end boolean)
language sql stable security definer set search_path = public as $$
  select e.product, e.plan_id, e.status, e.provider, e.env, e.trial_end, e.period_end, e.cancel_at_period_end
    from public.eab_billing_entitlements e
   where e.user_id = auth.uid()
$$;
revoke all on function public.eab_my_billing() from public, anon;
grant execute on function public.eab_my_billing() to authenticated;

drop function if exists public.eab_admin_agency_invoice_mark_paid(uuid, text, text, text);
drop function if exists public.eab_admin_agency_invoice_void(uuid, text, text);
drop function if exists public.eab_admin_agency_invoice_create(uuid, text, integer, integer, text, text, text, text, text);
drop function if exists public.eab_admin_agency_problems();
drop function if exists public.eab_admin_agency_invoices(text, integer);
drop function if exists public.eab_admin_agency_price_set(text, integer, integer, boolean, text, text);
drop function if exists public.eab_admin_agency_prices();
drop function if exists public.eab_agency_seat_set(uuid, uuid, boolean);
drop function if exists public.eab_my_agency(uuid);
drop function if exists public.eab_agency_price_list();
drop function if exists public.eab_agency_apply(text, text, uuid, text, text, integer, timestamptz);
drop function if exists public.eab_agency_invoice_links(uuid, text, text, text);
drop function if exists public.eab_agency_invoice_get(uuid, text);
drop function if exists public.eab_agency_open_checkout(uuid, uuid, text, integer, text);
drop function if exists public.eab_agency_member_role(uuid, uuid);
drop function if exists public.eab_agency_new_invoice(uuid, text, text, integer, integer, text, text, text, uuid);
drop function if exists public.eab_agency_fill_seats(uuid);
drop function if exists public.eab_agency_covers(uuid);
drop function if exists public.eab_agency_in_force(public.eab_agency_licences);
drop function if exists public.eab_agency_live();
drop table if exists public.eab_agency_events;
drop table if exists public.eab_agency_invoices;
drop sequence if exists public.eab_agency_invoice_no;
drop table if exists public.eab_agency_seats;
drop table if exists public.eab_agency_licences;
drop table if exists public.eab_agency_prices;
commit;
