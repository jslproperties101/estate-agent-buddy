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

// ---------- Personal Workspace / Team Workspace view ----------
export type WorkspaceView = 'personal' | 'team';
/** Personal Workspace: my own records. Team Workspace: what I share with the other agent plus what they share with me. */
export function inView(state: AppState, view: WorkspaceView, collection: CollectionName, record: { id: string }): boolean {
  if (view === 'personal') return !isForeign(state, collection, record.id);
  return isForeign(state, collection, record.id) || !!myShareOf(state, collection, record);
}
export const currentView = (state: AppState): WorkspaceView => (state.settings.workspaceView === 'team' && inTeam(state) ? 'team' : 'personal');

/** A list filtered to the workspace being looked at. Calculator and other private kinds are always personal. */
export function visible<T extends { id: string }>(state: AppState, collection: CollectionName, list: T[]): T[] {
  const view = currentView(state);
  if (!SHAREABLE.includes(collection)) return view === 'personal' ? list.filter(r => !isForeign(state, collection, r.id)) : [];
  return list.filter(r => inView(state, view, collection, r));
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
