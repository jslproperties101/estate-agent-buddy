// Change 20: the calls the Developer Dashboard makes (database functions eab_dev_* in
// supabase/proposed/20261018000000_change019_020_usage_dashboard.sql). Every one of them refuses a signed-in person who
// is not on the developer list, whatever the app shows: this file only asks and displays what the database answers.
import type { Store } from '../data/store';
import { config } from '../config';
import { rpc, TeamError } from '../team/api';

export interface Overview {
  users_total: number; users_new: number; active_users: number; returning_users: number; active_1d: number; active_7d: number; active_30d: number;
  sessions: number; active_minutes: number; google_calls: number; google_failures: number; ai_calls: number; errors: number; sync_failures: number;
  records_total: number; records_by_kind: Record<string, number>; files_count: number; files_bytes: number; database_bytes: number; usage_log_bytes: number;
  teams_active: number; invites: Record<string, number>; bug_reports: number;
  activation: { with_listing: number; with_photo: number; with_share: number };
}
export interface UserRow {
  user_id: string; email: string; signed_up: string; last_active: string | null; app_version: string | null; platform: string | null; device: string | null;
  sessions: number; active_minutes: number; google_calls: number; google_failures: number; ai_calls: number; errors: number; sync_failures: number;
  last_sync: string | null; last_drive_backup: string | null; local_bytes: number | null; records: Record<string, number>; records_total: number;
  files_count: number; files_bytes: number; in_team: boolean; bug_reports: number;
}
export interface BreakdownRow { user_id: string; email: string; kind: string; name: string; screen: string | null; calls: number; failures: number; total_value: number | null; last_at: string }
export interface EventRow { id: number; at: string; user_id: string; email: string; kind: string; name: string; screen: string | null; ok: boolean | null; n: number; value: number | null; app_version: string | null; platform: string | null; device: string | null }
export interface DailyRow { day: string; active_users: number; sessions: number; active_minutes: number; google_calls: number; ai_calls: number; errors: number }
export interface HistoryRow { user_id: string; email: string; kind: string; name: string; screen: string | null; calls: number; failures: number; total_value: number | null; first_day: string; last_day: string; days_used: number }

export interface Range { from: string; to: string }                 // timestamps (ISO)
export interface Days { from: string; to: string }                  // Malaysian dates, YYYY-MM-DD, both included
export interface Filters { user?: string; search?: string; appVersion?: string; kind?: string; name?: string; screen?: string }

export type DevErrorCode = 'unavailable' | 'not-allowed' | 'network' | 'not-signed-in' | 'other';

/** Plain words for a failure (the dashboard shows these). */
export function devErrorText(e: unknown): string {
  const code: DevErrorCode = e instanceof TeamError ? (['unavailable', 'not-allowed', 'network', 'not-signed-in'].includes(e.code) ? e.code as DevErrorCode : 'other') : 'other';
  switch (code) {
    case 'unavailable': return 'The dashboard part of the database has not been applied to this Supabase project yet.';
    case 'not-allowed': return 'This account is not on the developer list.';
    case 'network': return 'No connection. Try again when the phone is online.';
    case 'not-signed-in': return 'Sign in first.';
    default: return 'Something went wrong. Try again.';
  }
}

const nul = <T,>(v: T | '' | undefined): T | null => (v === '' || v === undefined ? null : v);

export class DevApi {
  constructor(private store: Store, private fetchFn: typeof fetch = (...a) => fetch(...a)) {}
  private call<T>(fn: string, body: Record<string, unknown>) { return rpc<T>(this.store, config(this.store.getState().settings), fn, body, this.fetchFn); }

  /** True when this account is on the developer list. False (not an error) when the database part is not installed. */
  async isDeveloper(): Promise<boolean> {
    try { return (await this.call<boolean>('eab_is_developer', {})) === true; } catch { return false; }
  }
  overview(r: Range) { return this.call<Overview>('eab_dev_overview', { p_from: r.from, p_to: r.to }); }
  users(r: Range, f: Filters) { return this.call<UserRow[]>('eab_dev_users', { p_from: r.from, p_to: r.to, p_search: nul(f.search), p_app_version: nul(f.appVersion) }); }
  breakdown(r: Range, f: Filters) {
    return this.call<BreakdownRow[]>('eab_dev_breakdown', { p_from: r.from, p_to: r.to, p_user: nul(f.user), p_kind: nul(f.kind), p_screen: nul(f.screen), p_app_version: nul(f.appVersion) });
  }
  events(r: Range, f: Filters, limit = 200) {
    return this.call<EventRow[]>('eab_dev_events', { p_from: r.from, p_to: r.to, p_user: nul(f.user), p_kind: nul(f.kind), p_name: nul(f.name), p_screen: nul(f.screen), p_app_version: nul(f.appVersion), p_limit: limit });
  }
  daily(d: Days, f: Filters) { return this.call<DailyRow[]>('eab_dev_daily', { p_from: d.from, p_to: d.to, p_user: nul(f.user) }); }
  history(d: Days, f: Filters) {
    return this.call<HistoryRow[]>('eab_dev_history', { p_from: d.from, p_to: d.to, p_user: nul(f.user), p_kind: nul(f.kind), p_name: nul(f.name), p_screen: nul(f.screen) });
  }
}

// ---------- periods (Malaysian time, UTC+8, no daylight saving) ----------
export type Preset = '1h' | '24h' | '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';
const MY_MS = 8 * 3_600_000;
export const myDate = (ms: number) => new Date(ms + MY_MS).toISOString().slice(0, 10);
const PRESET_MS: Record<Exclude<Preset, 'custom' | 'all'>, number> = { '1h': 3_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, '90d': 90 * 86_400_000, '1y': 365 * 86_400_000 };

/** The two kinds of range the dashboard asks for, for a preset or for two typed dates (Malaysian dates, inclusive). */
export function rangeOf(preset: Preset, custom: { from: string; to: string }, now = Date.now()): { range: Range; days: Days } {
  if (preset === 'custom') {
    const from = custom.from <= custom.to ? custom.from : custom.to;
    const to = custom.from <= custom.to ? custom.to : custom.from;
    const end = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    return { range: { from: new Date(`${from}T00:00:00+08:00`).toISOString(), to: new Date(`${end}T00:00:00+08:00`).toISOString() }, days: { from, to } };
  }
  if (preset === 'all') return { range: { from: new Date(now - PRESET_MS['1y']).toISOString(), to: new Date(now + 60_000).toISOString() }, days: { from: '2026-01-01', to: myDate(now) } };
  const span = PRESET_MS[preset];
  return { range: { from: new Date(now - span).toISOString(), to: new Date(now + 60_000).toISOString() }, days: { from: myDate(now - span), to: myDate(now) } };
}

// ---------- plain-text formats ----------
export function bytesText(b: number | null | undefined): string {
  if (b === null || b === undefined || !Number.isFinite(b)) return '–';
  if (b < 1024) return `${Math.round(b)} B`;
  const u = ['KB', 'MB', 'GB', 'TB']; let v = b / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}
export function minutesText(m: number | null | undefined): string {
  if (m === null || m === undefined) return '–';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
}
export function whenText(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
export const dayText = (iso: string | null | undefined) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : '–');
export const recordsText = (r: Record<string, number> | undefined) => Object.entries(r ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k} ${v}`).join(', ') || '–';
