// Change 010 D: audit history. One entry per save, with the exact before/after value of every field that changed, who
// did it (name, falling back to email) and when. Entries are never edited; deleting old ones is an explicit owner action
// that keeps a hidden backup copy (see data/store.ts and the cloud's eab_audit_delete).
// Ordinary viewing is never logged.
import type { CollectionName } from '../data/types';

export type AuditAction = 'create' | 'edit' | 'archive' | 'restore' | 'delete' | 'permission' | 'membership' | 'export' | 'delete_request' | 'delete_decision' | 'audit_delete';
/** The action types a person can filter by (all selected by default). Create counts as an edit. */
export type ActionFilter = 'edit' | 'delete' | 'restore' | 'permission' | 'membership' | 'export';
export const ACTION_FILTERS: ActionFilter[] = ['edit', 'delete', 'restore', 'permission', 'membership', 'export'];
export const filterOf = (a: AuditAction): ActionFilter =>
  a === 'create' || a === 'edit' ? 'edit'
    : a === 'archive' || a === 'delete' || a === 'delete_request' || a === 'delete_decision' || a === 'audit_delete' ? 'delete'
      : a === 'restore' ? 'restore' : a === 'permission' ? 'permission' : a === 'membership' ? 'membership' : 'export';

export interface AuditChange { field: string; before: unknown; after: unknown }
export interface AuditEntry {
  id: string;
  collection?: CollectionName | string;
  recordId?: string;
  /** Cloud workspace the record lives in (its owner's), when known. */
  workspaceId?: string;
  ownerId?: string;
  teamId?: string;
  actorId: string;
  actorName?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  changes?: AuditChange[];
  detail?: Record<string, unknown>;
  /** When it happened (ms since 1970). */
  at: number;
  /** The cloud's order number, once the cloud has it. */
  seq?: number;
}

/** Fields that are bookkeeping, not content. */
const IGNORED = new Set(['updated', 'history']);
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The exact field changes between two versions of a record. Nested objects become dotted paths (tenancy.rent); lists
 *  (photos, reminders…) are compared as a whole and kept whole, so before/after are always exact. */
export function diffFields(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined, prefix = ''): AuditChange[] {
  const out: AuditChange[] = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of [...keys].sort()) {
    if (!prefix && (IGNORED.has(k) || k === 'id')) continue;
    const b = before?.[k], a = after?.[k];
    if (same(b, a)) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (isPlain(b) && isPlain(a)) out.push(...diffFields(b, a, path));
    else out.push({ field: path, before: b === undefined ? null : structuredClone(b), after: a === undefined ? null : structuredClone(a) });
  }
  return out;
}

/** What kind of change a save was. */
export function actionFor(before: Record<string, unknown> | undefined, after: Record<string, unknown> | null, source: string): AuditAction {
  if (after === null) return 'delete';
  if (!before) return source === 'restore' ? 'restore' : 'create';
  if (after.archived && !before.archived) return 'archive';
  if (!after.archived && before.archived) return 'restore';
  if (source === 'restore' || source === 'undo') return 'restore';
  return 'edit';
}

// ---------- Malaysian-readable time: "15 Oct 2026, 4:30 PM (MYT, UTC+8)" ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Always Malaysia time (UTC+8, no daylight saving), whatever time zone the phone or computer is set to. */
export function mytParts(ms: number) {
  const d = new Date(ms + 8 * 3600_000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}
export function fmtMyt(ms: number): string {
  const p = mytParts(ms);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${p.d} ${MONTHS[p.mo]} ${p.y}, ${h12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'} (MYT, UTC+8)`;
}
/** yyyymmdd in Malaysia time (for file names). */
export function ymdMyt(ms: number): string { const p = mytParts(ms); return `${p.y}${String(p.mo + 1).padStart(2, '0')}${String(p.d).padStart(2, '0')}`; }

/** Shows one value from a field change. Exact, but long values are wrapped by the screen, never cut. */
export function showValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/** Newest first; the cloud's order breaks ties. */
export const newestFirst = (a: AuditEntry, b: AuditEntry) => b.at - a.at || (b.seq ?? 0) - (a.seq ?? 0) || (a.id < b.id ? 1 : -1);
