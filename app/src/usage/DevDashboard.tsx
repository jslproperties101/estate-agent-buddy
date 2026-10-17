// Change 20: the Developer Dashboard. Opened from Settings, and only offered to accounts on the developer list; the
// database refuses everyone else, so this screen is a viewer, not the protection. English only (a developer tool).
// Shows: whole-app numbers, one line per user (e-mail, last active, time in the app, listings and other records,
// storage, Google / AI / error counts, last sync and Drive backup), a breakdown by user, API and screen, the latest
// single events, and long-term totals per day that are kept forever. Everything can be filtered by period, user,
// e-mail, app version, kind, name and screen. It never shows record contents: the app never sends them.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../data/useStore';
import { Empty, Tabs } from '../ui/common';
import {
  BreakdownRow, DevApi, DailyRow, EventRow, Filters, HistoryRow, Overview, Preset, UserRow, bytesText, dayText, devErrorText, minutesText, myDate,
  rangeOf, recordsText, whenText,
} from './api';

type Tab = 'overview' | 'users' | 'google' | 'events' | 'history';
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' }, { value: 'users', label: 'Users' }, { value: 'google', label: 'Calls & features' },
  { value: 'events', label: 'Events' }, { value: 'history', label: 'History' },
];
const PRESETS: { value: Preset; label: string }[] = [
  { value: '1h', label: '1 hour' }, { value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' }, { value: '1y', label: '1 year' }, { value: 'custom', label: 'Dates…' },
];
const KINDS = ['google', 'session', 'screen', 'feature', 'ai', 'sync', 'error', 'metric'];

interface Loaded<T> { loading: boolean; data?: T; error?: string; reload: () => void }
function useLoad<T>(enabled: boolean, fn: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [s, set] = useState<{ loading: boolean; data?: T; error?: string }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;                       // only the section on screen asks the database
    let live = true;
    set(x => ({ ...x, loading: true, error: undefined }));
    fn().then(d => { if (live) set({ loading: false, data: d }); }).catch(e => { if (live) set({ loading: false, error: devErrorText(e) }); });
    return () => { live = false; };
  }, [enabled, ...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...s, reload: () => setTick(t => t + 1) };
}

const n0 = (x: number | null | undefined) => (x === null || x === undefined ? '–' : Math.round(x).toLocaleString('en-GB'));

/** A table that scrolls sideways on a phone. */
function DevTable({ cols, rows, testId }: { cols: string[]; rows: (string | number)[][]; testId?: string }) {
  return (
    <div className="dev-scroll" data-testid={testId}>
      <table className="dev-table">
        <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Comma-separated text of a table (for pasting into a spreadsheet). */
export function csvOf(cols: string[], rows: (string | number)[][]): string {
  const cell = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return [cols, ...rows].map(r => r.map(cell).join(',')).join('\n');
}
function CopyCsv({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  const [done, setDone] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(csvOf(cols, rows)); setDone('Copied'); } catch { setDone('Could not copy'); }
    setTimeout(() => setDone(''), 2500);
  }
  return <button type="button" className="btn secondary small" disabled={!rows.length} onClick={() => void copy()} data-testid="dev-copy">{done || 'Copy as CSV'}</button>;
}

function Stat({ label, value, sub, testId }: { label: string; value: string | number; sub?: string; testId?: string }) {
  return <div className="dev-stat" data-testid={testId}><small className="muted">{label}</small><strong>{value}</strong>{sub && <small className="muted">{sub}</small>}</div>;
}

function Bars({ title, rows, pick, unit = '' }: { title: string; rows: DailyRow[]; pick: (r: DailyRow) => number; unit?: string }) {
  const max = Math.max(1, ...rows.map(pick));
  const total = rows.reduce((a, r) => a + pick(r), 0);
  return (
    <div className="sub-card stack-sm" data-testid="dev-bars">
      <div className="between"><strong>{title}</strong><small className="muted">{n0(total)}{unit} in total</small></div>
      {rows.length === 0 ? <small className="muted">No data in this period.</small> : (
        <div className="dev-bars" role="img" aria-label={`${title} per day`}>
          {rows.map(r => <span key={r.day} className="dev-bar" title={`${dayText(r.day)}: ${n0(pick(r))}${unit}`} style={{ height: `${Math.max(3, Math.round((pick(r) / max) * 100))}%` }} />)}
        </div>
      )}
      {rows.length > 0 && <div className="between"><small className="muted">{dayText(rows[0].day)}</small><small className="muted">{dayText(rows[rows.length - 1].day)}</small></div>}
    </div>
  );
}

export function DevDashboard() {
  const { store } = useApp();
  const api = useMemo(() => new DevApi(store), [store]);
  const [tab, setTab] = useState<Tab>('overview');
  const [preset, setPreset] = useState<Preset>('24h');
  const today = myDate(Date.now());
  const [custom, setCustom] = useState({ from: today, to: today });
  const [draft, setDraft] = useState<Filters & { userEmail?: string }>({});
  const [f, setF] = useState<Filters & { userEmail?: string }>({});
  const { range, days } = useMemo(() => rangeOf(preset, custom), [preset, custom]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [sort, setSort] = useState<'last' | 'minutes' | 'google' | 'records' | 'storage' | 'errors'>('last');
  const [open, setOpen] = useState<string | null>(null);

  // A preset such as "24 hours" moves with the clock: it is worked out again whenever the screen loads data.
  const overview = useLoad<Overview>(tab === 'overview', () => api.overview(rangeOf(preset, custom).range), [api, preset, custom, f.appVersion]);
  const daily = useLoad<DailyRow[]>(tab === 'overview', () => api.daily(rangeOf(preset, custom).days, f), [api, preset, custom, f.user]);
  const users = useLoad<UserRow[]>(tab === 'users', () => api.users(rangeOf(preset, custom).range, f), [api, preset, custom, f.search, f.appVersion]);
  const calls = useLoad<BreakdownRow[]>(tab === 'google', () => api.breakdown(rangeOf(preset, custom).range, f), [api, preset, custom, f.user, f.kind, f.screen, f.appVersion]);
  const events = useLoad<EventRow[]>(tab === 'events', () => api.events(rangeOf(preset, custom).range, f, 200), [api, preset, custom, f.user, f.kind, f.name, f.screen, f.appVersion]);
  const history = useLoad<HistoryRow[]>(tab === 'history', () => api.history(rangeOf(preset === '1h' || preset === '24h' ? '30d' : preset, custom).days, f), [api, preset, custom, f.user, f.kind, f.name, f.screen]);

  const apply = () => setF({ ...draft, search: draft.search?.trim() || undefined, appVersion: draft.appVersion?.trim() || undefined, name: draft.name?.trim() || undefined, screen: draft.screen?.trim().toLowerCase() || undefined });
  const clear = () => { setDraft({}); setF({}); };
  const showUser = (u: UserRow) => { const x = { ...f, user: u.user_id, userEmail: u.email }; setDraft(x); setF(x); setTab('google'); };
  const refresh = () => { overview.reload(); daily.reload(); users.reload(); calls.reload(); events.reload(); history.reload(); };

  const sortedUsers = useMemo(() => {
    const list = [...(users.data ?? [])];
    const key: Record<typeof sort, (u: UserRow) => number> = {
      last: u => (u.last_active ? Date.parse(u.last_active) : 0), minutes: u => u.active_minutes, google: u => u.google_calls,
      records: u => u.records_total, storage: u => u.files_bytes + (u.local_bytes ?? 0), errors: u => u.errors + u.sync_failures,
    };
    return list.sort((a, b) => key[sort](b) - key[sort](a));
  }, [users.data, sort]);

  const byName = useMemo(() => {
    const m = new Map<string, { calls: number; failures: number }>();
    for (const r of calls.data ?? []) { const k = `${r.kind} · ${r.name}`; const x = m.get(k) ?? { calls: 0, failures: 0 }; x.calls += r.calls; x.failures += r.failures; m.set(k, x); }
    return [...m].sort((a, b) => b[1].calls - a[1].calls);
  }, [calls.data]);

  const first = [overview, daily, users, calls, events, history].find(l => l.error);
  const o = overview.data;

  return (
    <section className="stack" data-testid="dev-dashboard">
      <div className="notice" data-testid="dev-note">Developer only. Shows counts, times and sizes per user. Record contents, addresses and locations are never collected.</div>

      <Tabs<Tab> value={tab} options={TABS} onChange={setTab} label="Dashboard sections" />

      <div className="card stack-sm" data-testid="dev-filters">
        <div className="chip-row" role="group" aria-label="Period">
          {PRESETS.map(p => <button key={p.value} type="button" className={`chip-btn ${preset === p.value ? 'on' : ''}`} aria-pressed={preset === p.value} onClick={() => setPreset(p.value)} data-testid={`dev-period-${p.value}`}>{p.label}</button>)}
        </div>
        {preset === 'custom' && (
          <div className="two">
            <label className="ff">From<input type="date" value={custom.from} max={today} onChange={e => setCustom(c => ({ ...c, from: e.target.value || c.from }))} data-testid="dev-from" /></label>
            <label className="ff">To<input type="date" value={custom.to} max={today} onChange={e => setCustom(c => ({ ...c, to: e.target.value || c.to }))} data-testid="dev-to" /></label>
          </div>
        )}
        <small className="muted">Malaysian time. {tab === 'history' && (preset === '1h' || preset === '24h') ? 'History needs whole days, so it shows 30 days here.' : ''}{tab === 'events' || tab === 'users' || tab === 'google' ? ' Detailed events are kept for 1 year; use History for older totals.' : ''}</small>
        <details>
          <summary>Filters{Object.values(f).some(Boolean) ? ' (on)' : ''}</summary>
          <div className="stack-sm">
            <label className="ff">E-mail contains<input value={draft.search ?? ''} onChange={e => setDraft(d => ({ ...d, search: e.target.value }))} autoCapitalize="none" data-testid="dev-search" /></label>
            {draft.user && <div className="between"><small>User: <strong>{draft.userEmail ?? draft.user}</strong></small><button type="button" className="link-btn small" onClick={() => setDraft(d => ({ ...d, user: undefined, userEmail: undefined }))}>Remove</button></div>}
            <label className="ff">App version<input value={draft.appVersion ?? ''} onChange={e => setDraft(d => ({ ...d, appVersion: e.target.value }))} autoCapitalize="none" /></label>
            <label className="ff">Kind
              <select value={draft.kind ?? ''} onChange={e => setDraft(d => ({ ...d, kind: e.target.value || undefined }))} data-testid="dev-kind"><option value="">All</option>{KINDS.map(k => <option key={k} value={k}>{k}</option>)}</select>
            </label>
            <label className="ff">Name (exact, e.g. geocoding.reverse)<input value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} autoCapitalize="none" data-testid="dev-name" /></label>
            <label className="ff">Screen (e.g. location-picker)<input value={draft.screen ?? ''} onChange={e => setDraft(d => ({ ...d, screen: e.target.value }))} autoCapitalize="none" data-testid="dev-screen" /></label>
            <div className="two"><button type="button" className="btn secondary" onClick={clear} data-testid="dev-clear">Clear</button><button type="button" className="btn primary" onClick={apply} data-testid="dev-apply">Apply</button></div>
          </div>
        </details>
        <div className="between"><small className="muted">{f.userEmail ? `Showing ${f.userEmail}` : 'All users'}</small><button type="button" className="btn secondary small" onClick={refresh} data-testid="dev-refresh">Refresh</button></div>
      </div>

      {first?.error && <p className="warn-text" role="alert" data-testid="dev-error">{first.error}</p>}

      {tab === 'overview' && (
        <div className="stack" data-testid="dev-overview">
          {overview.loading && !o && <p className="muted" role="status">Loading…</p>}
          {o && (
            <>
              <div className="dev-grid">
                <Stat label="Users in total" value={n0(o.users_total)} sub={`${n0(o.users_new)} new in this period`} testId="dev-users-total" />
                <Stat label="Active in this period" value={n0(o.active_users)} sub={`${n0(o.returning_users)} returning`} />
                <Stat label="Active now-ish" value={`${n0(o.active_1d)} / ${n0(o.active_7d)} / ${n0(o.active_30d)}`} sub="1 day / 7 days / 30 days" />
                <Stat label="Sessions" value={n0(o.sessions)} />
                <Stat label="Time in the app" value={minutesText(o.active_minutes)} sub={o.active_users ? `${minutesText(Math.round((o.active_minutes / o.active_users) * 10) / 10)} per active user` : undefined} />
                <Stat label="Google calls" value={n0(o.google_calls)} sub={`${n0(o.google_failures)} failed`} testId="dev-google-calls" />
                <Stat label="AI calls" value={n0(o.ai_calls)} />
                <Stat label="Errors" value={n0(o.errors)} sub={`${n0(o.sync_failures)} sync / backup failures`} />
                <Stat label="Records" value={n0(o.records_total)} sub={recordsText(o.records_by_kind)} />
                <Stat label="Photos & documents" value={n0(o.files_count)} sub={bytesText(o.files_bytes)} />
                <Stat label="Database size" value={bytesText(o.database_bytes)} sub={`usage log ${bytesText(o.usage_log_bytes)}`} />
                <Stat label="Teams" value={n0(o.teams_active)} sub={`invitations: ${recordsText(o.invites)}`} />
                <Stat label="Bug reports" value={n0(o.bug_reports)} />
                <Stat label="Added a listing" value={`${n0(o.activation.with_listing)} of ${n0(o.users_total)}`} />
                <Stat label="Added a photo" value={`${n0(o.activation.with_photo)} of ${n0(o.users_total)}`} />
                <Stat label="Shared with a teammate" value={`${n0(o.activation.with_share)} of ${n0(o.users_total)}`} />
              </div>
              <Bars title="Active users per day" rows={daily.data ?? []} pick={r => r.active_users} />
              <Bars title="Minutes in the app per day" rows={daily.data ?? []} pick={r => r.active_minutes} unit=" min" />
              <Bars title="Google calls per day" rows={daily.data ?? []} pick={r => r.google_calls} />
              <Bars title="Errors per day" rows={daily.data ?? []} pick={r => r.errors} />
            </>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="stack" data-testid="dev-users">
          <label className="ff">Sort by
            <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} data-testid="dev-sort">
              <option value="last">Last active</option><option value="minutes">Time in the app</option><option value="google">Google calls</option>
              <option value="records">Records</option><option value="storage">Storage</option><option value="errors">Errors</option>
            </select>
          </label>
          {users.loading && !users.data && <p className="muted" role="status">Loading…</p>}
          {users.data && sortedUsers.length === 0 && <Empty>No users match.</Empty>}
          {sortedUsers.map(u => (
            <div key={u.user_id} className="card stack-sm" data-testid="dev-user">
              <button type="button" className="link-row" onClick={() => setOpen(open === u.user_id ? null : u.user_id)} aria-expanded={open === u.user_id}>
                <span className="between"><strong>{u.email}</strong><small className="muted">{whenText(u.last_active)}</small></span>
                <small className="muted">{minutesText(u.active_minutes)} · {n0(u.sessions)} sessions · {n0(u.records_total)} records · Google {n0(u.google_calls)} · errors {n0(u.errors + u.sync_failures)}</small>
              </button>
              {open === u.user_id && (
                <div className="stack-sm" data-testid="dev-user-detail">
                  <DevTable cols={['Item', 'Value']} rows={[
                    ['Signed up', whenText(u.signed_up)], ['Last active', whenText(u.last_active)],
                    ['App version', u.app_version ?? '–'], ['Phone', [u.platform, u.device].filter(Boolean).join(' · ') || '–'],
                    ['Sessions', n0(u.sessions)], ['Time in the app', minutesText(u.active_minutes)],
                    ['Records', recordsText(u.records)], ['Photos & documents', `${n0(u.files_count)} · ${bytesText(u.files_bytes)}`],
                    ['Data on the phone', bytesText(u.local_bytes)],
                    ['Google calls', `${n0(u.google_calls)} (${n0(u.google_failures)} failed)`], ['AI calls', n0(u.ai_calls)],
                    ['Errors', n0(u.errors)], ['Sync / backup failures', n0(u.sync_failures)],
                    ['Last successful sync', whenText(u.last_sync)], ['Last Drive backup', whenText(u.last_drive_backup)],
                    ['In a team', u.in_team ? 'Yes' : 'No'], ['Bug reports', n0(u.bug_reports)],
                  ]} />
                  <button type="button" className="btn secondary small" onClick={() => showUser(u)} data-testid="dev-show-user">Show their calls and features</button>
                </div>
              )}
            </div>
          ))}
          {sortedUsers.length > 0 && <CopyCsv cols={['Email', 'Last active', 'Sessions', 'Minutes', 'Records', 'Photo/doc bytes', 'Google', 'AI', 'Errors']}
            rows={sortedUsers.map(u => [u.email, u.last_active ?? '', u.sessions, u.active_minutes, u.records_total, u.files_bytes, u.google_calls, u.ai_calls, u.errors + u.sync_failures])} />}
        </div>
      )}

      {tab === 'google' && (
        <div className="stack" data-testid="dev-calls">
          {calls.loading && !calls.data && <p className="muted" role="status">Loading…</p>}
          {calls.data && calls.data.length === 0 && <Empty>No calls or features in this period.</Empty>}
          {byName.length > 0 && (
            <div className="card stack-sm" data-testid="dev-by-name">
              <div className="card-title">By API or feature</div>
              <DevTable cols={['Kind · name', 'Calls', 'Failed']} rows={byName.map(([k, v]) => [k, n0(v.calls), n0(v.failures)])} />
            </div>
          )}
          {calls.data && calls.data.length > 0 && (
            <div className="card stack-sm">
              <div className="card-title">By user and screen</div>
              <DevTable testId="dev-calls-table" cols={['E-mail', 'Kind', 'Name', 'Screen', 'Calls', 'Failed', 'Last']} rows={calls.data.map(r => [r.email, r.kind, r.name, r.screen ?? '–', n0(r.calls), n0(r.failures), whenText(r.last_at)])} />
              <CopyCsv cols={['Email', 'Kind', 'Name', 'Screen', 'Calls', 'Failed', 'Last']} rows={calls.data.map(r => [r.email, r.kind, r.name, r.screen ?? '', r.calls, r.failures, r.last_at])} />
            </div>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div className="stack" data-testid="dev-events">
          {events.loading && !events.data && <p className="muted" role="status">Loading…</p>}
          {events.data && events.data.length === 0 && <Empty>No events in this period.</Empty>}
          {events.data && events.data.length > 0 && (
            <div className="card stack-sm">
              <small className="muted">Latest {events.data.length} events (newest first, at most 200).</small>
              <DevTable testId="dev-events-table" cols={['Time', 'E-mail', 'Kind', 'Name', 'Screen', 'OK', 'Value']}
                rows={events.data.map(e => [whenText(e.at), e.email, e.kind, e.name, e.screen ?? '–', e.ok === null ? '–' : e.ok ? 'yes' : 'NO', e.value === null ? '–' : n0(e.value)])} />
              <CopyCsv cols={['Time', 'Email', 'Kind', 'Name', 'Screen', 'OK', 'Value', 'Version', 'Device']} rows={events.data.map(e => [e.at, e.email, e.kind, e.name, e.screen ?? '', e.ok === null ? '' : String(e.ok), e.value ?? '', e.app_version ?? '', e.device ?? ''])} />
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="stack" data-testid="dev-history">
          <small className="muted">Daily totals per user, kept for as long as the account exists (the detailed events are kept for 1 year).</small>
          {history.loading && !history.data && <p className="muted" role="status">Loading…</p>}
          {history.data && history.data.length === 0 && <Empty>No totals in this period.</Empty>}
          {history.data && history.data.length > 0 && (
            <div className="card stack-sm">
              <DevTable testId="dev-history-table" cols={['E-mail', 'Kind', 'Name', 'Screen', 'Calls', 'Failed', 'First day', 'Last day', 'Days']}
                rows={history.data.map(r => [r.email, r.kind, r.name, r.screen ?? '–', n0(r.calls), n0(r.failures), dayText(r.first_day), dayText(r.last_day), n0(r.days_used)])} />
              <CopyCsv cols={['Email', 'Kind', 'Name', 'Screen', 'Calls', 'Failed', 'First day', 'Last day', 'Days']} rows={history.data.map(r => [r.email, r.kind, r.name, r.screen ?? '', r.calls, r.failures, r.first_day, r.last_day, r.days_used])} />
            </div>
          )}
        </div>
      )}
      <small className="muted">Period used: {range.from.slice(0, 16).replace('T', ' ')} to {range.to.slice(0, 16).replace('T', ' ')} UTC · days {days.from} to {days.to}</small>
    </section>
  );
}

/** The Settings card that opens the dashboard. Shown only when the database says this account is a developer. */
export function DevEntry({ go }: { go: () => void }) {
  const { store, state } = useApp();
  const userId = state.meta.syncSession?.userId;
  const [dev, setDev] = useState(false);
  useEffect(() => {
    let live = true;
    setDev(false);
    if (userId) void new DevApi(store).isDeveloper().then(v => { if (live) setDev(v); });
    return () => { live = false; };
  }, [store, userId]);
  if (!dev) return null;
  return (
    <div className="card stack-sm" data-testid="dev-entry">
      <div className="card-title">Developer: usage dashboard</div>
      <small className="muted">Who uses the app, how much, and what it costs: Google calls, time in the app, records and storage per user.</small>
      <button type="button" className="btn primary" onClick={go} data-testid="open-dev-dashboard">Open dashboard</button>
    </div>
  );
}
