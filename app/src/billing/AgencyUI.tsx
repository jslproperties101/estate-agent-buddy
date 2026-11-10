// Batch 5 part 2 (10 Nov 2026): the Agency licence card inside Settings → Plans, for someone signed in to a team workspace.
// Everybody sees whether the agency's licence is in force and whether they hold a seat. The agency owner and admins also
// give and take back seats. Buying, prices and invoices are shown on the website (laptop) only: never inside the Android app.
import { useEffect, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { fmtDate } from '../lib/dates';
import { openInBrowser } from '../native/native';
import { useToast } from '../ui/toast';
import { TeamError } from '../team/api';
import { refreshBilling } from './api';
import { rm } from './plans';
import { agencyPaysHere, agencyPrices, agencyTotal, invoiceCardLink, isBoss, readAgency, setSeat, startAgencyCheckout, type AgencyPrice, type MyAgency } from './agency';
import { agencyStrings } from './agencyStrings';

export function AgencyCard({ lang, workspaceId }: { lang: Lang; workspaceId: string }) {
  const { state, store } = useApp();
  const toast = useToast();
  const s = agencyStrings[lang];
  const cfg = config(state.settings);
  const [a, setA] = useState<MyAgency | null>(null);
  const [gone, setGone] = useState(false);           // the database has no agency licences (before the Batch 5b SQL)
  const [prices, setPrices] = useState<AgencyPrice[]>([]);
  const [style, setStyle] = useState<'seats' | 'agency'>('seats');
  const [yearly, setYearly] = useState(false);
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const pays = agencyPaysHere();

  const load = async () => {
    try {
      const x = await readAgency(store, cfg, workspaceId);
      setA(x);
      if (x.licence) setSeats(Math.max(1, x.licence.seats));
      if (pays && isBoss(x)) setPrices(await agencyPrices(store, cfg).catch(() => []));
    } catch (e) { if (e instanceof TeamError && e.code === 'unavailable') setGone(true); }
  };
  useEffect(() => { void load(); }, [workspaceId]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (gone || !a) return null;
  const boss = isBoss(a);
  const l = a.licence;
  const fail = (e: unknown) => {
    const msg = String((e as Error)?.message ?? '');
    toast((e instanceof TeamError && e.code === 'not-allowed') || /only the agency owner|not-allowed/.test(msg) ? s.notAllowed : /seats are in use/.test(msg) ? s.seatsFull : s.failed, 'error');
  };
  const seat = async (userId: string, on: boolean) => {
    setBusy(true);
    try { await setSeat(store, cfg, workspaceId, userId, on); toast(on ? s.seatGiven : s.seatTaken); await load(); await refreshBilling(store, cfg); }
    catch (e) { fail(e); }
    setBusy(false);
  };
  const plan = `agency_${style === 'seats' ? 'seat_' : ''}${yearly ? 'yearly' : 'monthly'}` as AgencyPrice['plan'];
  const price = prices.find(p => p.plan === plan);
  const total = price ? agencyTotal(price, seats) : null;
  const pay = async (provider: 'fpx' | 'stripe') => {
    setBusy(true);
    try {
      const r = await startAgencyCheckout(store, cfg, workspaceId, plan, total?.seats ?? seats, provider);
      if (/^https:\/\//.test(r.url) && await openInBrowser(r.url)) toast(s.opened); else toast(s.failed, 'error');
    } catch (e) { fail(e); }
    setBusy(false);
  };

  return (
    <div className="card stack-sm" data-testid="agency-card">
      <div className="card-title">{s.title}</div>
      <small data-testid="agency-state">
        {!l ? s.none : l.in_force ? s.inForce(fmtDate(l.period_end, lang)) : s.ended}
        {l && l.env === 'sandbox' ? ' · test' : ''}
      </small>
      {l && <small className="muted" data-testid="agency-seats">{s.seatsUsed(a.seats_used, l.seats)}</small>}
      {l && <small data-testid="agency-my-seat">{a.my_seat ? s.mySeat : s.noSeat}</small>}
      {!boss && <small className="muted">{s.managed}</small>}

      {boss && l && (a.members ?? []).length > 0 && <>
        <div className="card-title">{s.members}</div>
        {(a.members ?? []).filter(m => m.role !== 'limited').map(m => (
          <div className="between" key={m.user_id} data-testid="agency-member">
            <small className="agency-email">{m.email}</small>
            <button className={`btn small ${m.seat ? 'secondary' : 'primary'}`} data-testid={m.seat ? 'agency-take' : 'agency-give'} disabled={busy || (!m.seat && a.seats_used >= l.seats)}
              onClick={() => seat(m.user_id, !m.seat)}>{m.seat ? s.take : s.give}</button>
          </div>
        ))}
      </>}

      {boss && pays && prices.length > 0 && <>
        <div className="card-title">{s.buy}</div>
        <div className="seg" role="group" aria-label={s.buy}>
          <button data-testid="agency-style-seats" aria-pressed={style === 'seats'} onClick={() => setStyle('seats')}>{s.perSeat}</button>
          <button data-testid="agency-style-agency" aria-pressed={style === 'agency'} onClick={() => setStyle('agency')}>{s.perAgency}</button>
        </div>
        <div className="seg" role="group">
          <button data-testid="agency-monthly" aria-pressed={!yearly} onClick={() => setYearly(false)}>{s.monthly}</button>
          <button data-testid="agency-yearly" aria-pressed={yearly} onClick={() => setYearly(true)}>{s.yearly}</button>
        </div>
        {style === 'seats'
          ? <label className="ff">{s.seats}<input data-testid="agency-seat-count" inputMode="numeric" value={String(seats)} onChange={e => setSeats(Math.min(500, Math.max(1, +e.target.value.replace(/\D/g, '') || 1)))} /></label>
          : price?.seats_included && <small>{s.covers(price.seats_included)}</small>}
        {total && <strong data-testid="agency-total">{s.total(rm(total.sen), price!.days)}</strong>}
        {total && a.seats_used > total.seats && <small className="muted">{s.fewer(a.seats_used)}</small>}
        <div className="chip-row">
          <button className="btn small primary" data-testid="agency-pay-fpx" disabled={busy || !total} onClick={() => pay('fpx')}>{s.payFpx}</button>
          <button className="btn small primary" data-testid="agency-pay-card" disabled={busy || !total} onClick={() => pay('stripe')}>{s.payCard}</button>
        </div>
        <small className="muted">{s.placeholder}</small>
      </>}

      {boss && pays && (a.invoices ?? []).length > 0 && <>
        <div className="card-title">{s.invoices}</div>
        {(a.invoices ?? []).map(i => {
          const card = invoiceCardLink(cfg, i);
          return (
            <div className="stack-sm" key={i.id} data-testid="agency-invoice">
              <div className="between"><small><b>{i.no}</b> · {rm(i.amount_sen)} · {i.days}d</small><small className="muted">{s.status[i.status]}</small></div>
              {i.status === 'open' && <div className="chip-row">
                {i.fpx_url && <a className="btn small secondary" href={i.fpx_url} target="_blank" rel="noopener noreferrer">{s.payFpx}</a>}
                {card && <a className="btn small secondary" href={card} target="_blank" rel="noopener noreferrer">{s.payCard}</a>}
              </div>}
            </div>
          );
        })}
      </>}
      <button className="btn small secondary" data-testid="agency-refresh" disabled={busy} onClick={() => { void load(); void refreshBilling(store, cfg); }}>{s.refresh}</button>
    </div>
  );
}
