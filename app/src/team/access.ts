// Change 010: who may do what with a record on THIS phone. Every screen, search, export and bulk action asks here, so
// the rule is the same everywhere and nothing depends on a button being hidden. The cloud enforces the same rules again
// (supabase/proposed/20261016000000_change010_team_sharing_audit.sql); this module never widens what the cloud allows.
//
//  owner  my own record (anything not listed in meta.shared). Everything, including permanent delete and sharing.
//  edit   shared with me as View and Edit: edit; restore; delete a shared To-Do / Calendar entry; for a property, ask
//         its owner to delete it (deletion request). Never permanent delete, never share onward.
//  view   shared with me as View Only: read it and its audit history, export that history. Nothing else.
//  null   not visible on this phone (not mine and not shared with me).
import type { AppState, CollectionName, ShareLevel, ShareScope, SharedInfo } from '../data/types';

export type Level = 'owner' | ShareLevel | null;
export type Action =
  | 'view' | 'edit' | 'archive' | 'restore' | 'deletePermanent' | 'requestDelete' | 'delete'
  | 'share' | 'viewAudit' | 'exportAudit' | 'deleteAudit';

/** Kinds of record that can be shared at all. The calculator and everything else stay private. */
export const SHAREABLE: CollectionName[] = ['properties', 'contacts', 'tasks', 'appointments'];
/** Kinds of record with a View History section (Change 010 D). */
export const AUDITED: CollectionName[] = ['properties', 'contacts', 'tasks', 'appointments', 'calculations', 'inquiries', 'deals', 'banners'];

const BUYER = ['buyer', 'tenant', 'investor'];
const VENDOR = ['vendor', 'landlord'];

/** The Share All categories a record falls in (a contact can be both a buyer and a vendor). */
export function scopesOf(collection: CollectionName, record: unknown): ShareScope[] {
  if (collection === 'properties') return ['properties'];
  if (collection === 'tasks') return ['tasks'];
  if (collection === 'appointments') return ['appointments'];
  if (collection === 'contacts') {
    const roles = ((record as { roles?: string[] } | undefined)?.roles ?? []);
    const out: ShareScope[] = [];
    if (roles.some(r => BUYER.includes(r))) out.push('buyers');
    if (roles.some(r => VENDOR.includes(r))) out.push('vendors');
    return out;
  }
  return [];
}

export const keyOf = (collection: CollectionName, id: string) => `${collection}:${id}`;
export const sharedInfo = (state: AppState, collection: CollectionName, id: string): SharedInfo | undefined => state.meta.shared?.[keyOf(collection, id)];
export const isForeign = (state: AppState, collection: CollectionName, id: string) => !!sharedInfo(state, collection, id);

/** My user id (the Google account through Supabase), or "local" when nobody is signed in on this phone. */
export const myId = (state: AppState) => state.meta.syncSession?.userId ?? 'local';

/** The record itself, if it is on this phone. */
export function findRecord(state: AppState, collection: CollectionName, id: string): (Record<string, unknown> & { id: string }) | undefined {
  return (state[collection] as unknown as (Record<string, unknown> & { id: string })[]).find(r => r.id === id);
}

/** My access to one record on this phone. */
export function levelOf(state: AppState, collection: CollectionName, id: string): Level {
  const info = sharedInfo(state, collection, id);
  if (info) return info.level === 'edit' ? 'edit' : 'view';
  return findRecord(state, collection, id) ? 'owner' : null;
}

/** Whether I may do `action` on the record. Re-evaluated at the moment of every action (permissions can change between
 *  opening a screen and pressing a button). */
export function can(state: AppState, action: Action, collection: CollectionName, id: string): boolean {
  const lv = levelOf(state, collection, id);
  if (!lv) return false;
  const rec = findRecord(state, collection, id);
  switch (action) {
    case 'view': case 'viewAudit': case 'exportAudit': return true;
    case 'edit': return lv !== 'view';
    case 'restore': return lv !== 'view';
    // Deleting a property archives it: only its owner (an editor asks with a deletion request).
    case 'archive': return lv === 'owner' && collection === 'properties';
    case 'requestDelete': return lv === 'edit' && collection === 'properties';
    // Ordinary delete of other kinds: the owner; a shared To-Do or Calendar entry also by an editor (Change 010 C).
    case 'delete': return lv === 'owner' || (lv === 'edit' && (collection === 'tasks' || collection === 'appointments'));
    case 'deletePermanent': return lv === 'owner';
    case 'deleteAudit': return lv === 'owner';
    case 'share': return lv === 'owner' && SHAREABLE.includes(collection) && !(rec as { sample?: boolean } | undefined)?.sample && !!partnerOf(state);
  }
}

// ---------- Team Workspace ----------
/** The other agent in my Team Workspace (undefined while I am alone or in none). */
export function partnerOf(state: AppState) {
  const t = state.meta.team;
  if (!t?.id) return undefined;
  return t.members.find(m => m.userId !== myId(state));
}
export const inTeam = (state: AppState) => !!state.meta.team?.id;
/** The "team owner": the agent who created the Team Workspace. */
export const isTeamOwner = (state: AppState) => !!state.meta.team?.id && state.meta.team.createdBy === myId(state);

/** How I currently share one of MY records with the other agent (selected and/or Share All), or null. */
export function myShareOf(state: AppState, collection: CollectionName, record: { id: string }): { level: ShareLevel; via: ('selected' | 'all')[] } | null {
  const t = state.meta.team;
  if (!t?.id || !partnerOf(state) || isForeign(state, collection, record.id)) return null;
  const sel = t.sharesGiven.find(s => s.collection === collection && s.recordId === record.id);
  const scopes = scopesOf(collection, record);
  const all = t.shareAllGiven.filter(a => scopes.includes(a.scope));
  if (!sel && !all.length) return null;
  const levels = [sel?.level, ...all.map(a => a.level)].filter(Boolean) as ShareLevel[];
  return { level: levels.includes('edit') ? 'edit' : 'view', via: [...(sel ? ['selected' as const] : []), ...(all.length ? ['all' as const] : [])] };
}

// ---------- one combined workspace (Change 16, owner 17 Oct 2026; replaces Change 010's Personal / Team views) ----------
/** Every list shows my own records AND the records another agent shares with me, together. Who created each one is shown
 *  on the card and can be filtered ("Created by"). Nothing about access changes: a View Only record stays read-only
 *  (see `can` and the store's own check), and nothing of mine is visible to anyone unless I share it.
 *  Kinds that can never be shared (calculator, inquiries, deals…) only ever hold my own records. */
export function visible<T extends { id: string }>(state: AppState, collection: CollectionName, list: T[]): T[] {
  if (SHAREABLE.includes(collection)) return list;
  return list.filter(r => !isForeign(state, collection, r.id));
}

// ---------- who created a record (Change 15) ----------
/** "me" for my own records, otherwise the owner's user id. */
export const creatorKeyOf = (state: AppState, collection: CollectionName, id: string): string => sharedInfo(state, collection, id)?.ownerId ?? 'me';

/** The other people whose records are on this phone, plus the other member of my Team Workspace. */
export function otherCreators(state: AppState): { id: string; name?: string | null; email?: string | null }[] {
  const m = new Map<string, { id: string; name?: string | null; email?: string | null }>();
  for (const x of Object.values(state.meta.shared ?? {})) if (x.ownerId && x.ownerId !== myId(state) && !m.has(x.ownerId)) m.set(x.ownerId, { id: x.ownerId, name: x.ownerName, email: x.ownerEmail });
  const p = partnerOf(state);
  if (p && !m.has(p.userId)) m.set(p.userId, { id: p.userId, name: p.name, email: p.email });
  return [...m.values()];
}

const words = (name?: string | null) => (name ?? '').trim().split(/\s+/).filter(Boolean);
/** First name; the part of the e-mail before "@" when there is no name. */
export const firstNameOf = (name?: string | null, email?: string | null) => words(name)[0] ?? (email ? email.split('@')[0] : '') ?? '';

/** Short names for the other creators: first name, plus the last name's initial when two of them share a first name. */
export function creatorNames(state: AppState): Map<string, string> {
  const others = otherCreators(state);
  const count = new Map<string, number>();
  for (const o of others) { const f = firstNameOf(o.name, o.email).toLowerCase(); count.set(f, (count.get(f) ?? 0) + 1); }
  const out = new Map<string, string>();
  for (const o of others) {
    const first = firstNameOf(o.name, o.email) || '—';
    if ((count.get(first.toLowerCase()) ?? 0) < 2) { out.set(o.id, first); continue; }
    const w = words(o.name);
    const extra = w.length > 1 ? `${w[w.length - 1][0].toUpperCase()}.` : (o.email ?? '').split('@')[0];
    out.set(o.id, extra ? `${first} ${extra}` : first);
  }
  return out;
}
/** The creator shown on a card: `you` for my own records, the short name for someone else's. */
export function creatorLabel(state: AppState, collection: CollectionName, id: string, you: string, names = creatorNames(state)): string {
  const k = creatorKeyOf(state, collection, id);
  if (k === 'me') return you;
  const info = sharedInfo(state, collection, id);
  return names.get(k) ?? (firstNameOf(info?.ownerName, info?.ownerEmail) || '—');
}
/** The "Created by" filter: 'all', 'me' or another person's user id. */
export function byCreator<T extends { id: string }>(state: AppState, collection: CollectionName, list: T[], filter: string): T[] {
  if (!filter || filter === 'all') return list;
  return list.filter(r => creatorKeyOf(state, collection, r.id) === filter);
}

// ---------- names ----------
/** A person's name, falling back to their email (Change 010 rule). */
export const personLabel = (name?: string | null, email?: string | null, fallback = '—') => (name && name.trim()) || (email && email.trim()) || fallback;
/** My own label for audit entries and exports. */
export function myLabel(state: AppState): { id: string; name?: string; email?: string } {
  const s = state.meta.syncSession;
  return { id: myId(state), name: s?.name || state.profile.fullName || undefined, email: s?.email || state.profile.email || undefined };
}
/** Who created a record, for shared cards and detail views: the other agent for a shared-in record, me otherwise. */
export function creatorOf(state: AppState, collection: CollectionName, id: string): { name?: string | null; email?: string | null; mine: boolean } {
  const info = sharedInfo(state, collection, id);
  if (info) return { name: info.ownerName, email: info.ownerEmail, mine: false };
  const me = myLabel(state);
  return { name: me.name, email: me.email, mine: true };
}
/** A user id → label, using what the phone knows (team members, shared-record owners, me). */
export function labelForUser(state: AppState, userId: string | undefined, name?: string | null, email?: string | null): string {
  if (name || email) return personLabel(name, email);
  if (!userId) return '—';
  if (userId === myId(state)) { const me = myLabel(state); return personLabel(me.name, me.email); }
  const m = state.meta.team?.members.find(x => x.userId === userId);
  if (m) return personLabel(m.name, m.email);
  const o = Object.values(state.meta.shared ?? {}).find(x => x.ownerId === userId);
  if (o) return personLabel(o.ownerName, o.ownerEmail);
  return '—';
}
