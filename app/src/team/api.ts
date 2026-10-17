// Change 010: the Team Workspace calls to the cloud (functions in supabase/proposed/20261016000000_change010_*.sql).
// Every answer comes from the database, which enforces the rules; the phone only shows what it was told. Until the
// proposal is applied to the project, the functions do not exist and every call answers "unavailable" (said plainly on
// the Team Workspace screen; nothing pretends to work).
import type { Store } from '../data/store';
import { fresh, supabaseCall, supabaseHeaders, SyncConfig, SyncError, configured } from '../data/sync';
import type { CollectionName, DeleteRequest, ShareLevel, ShareScope, TeamInvite, TeamMember, TeamState } from '../data/types';
import { usage } from '../usage/logger';

type FetchFn = typeof fetch;

export type TeamErrorCode =
  | 'unavailable' | 'not-signed-in' | 'network' | 'full' | 'invite-waiting' | 'expired' | 'other-account' | 'no-longer-valid'
  | 'self' | 'invalid-email' | 'already-in-team' | 'own-invite' | 'disabled' | 'not-found' | 'not-allowed' | 'no-partner' | 'other';
export class TeamError extends Error { constructor(public code: TeamErrorCode, message?: string) { super(message ?? code); } }

/** Turns the database's refusal into one of the codes the screens explain. */
export function teamErrorOf(e: unknown): TeamError {
  if (e instanceof TeamError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  const code = e instanceof SyncError ? e.code : '';
  if (code === 'network') return new TeamError('network', msg);
  if (code === 'not-signed-in' || code === 'not-configured') return new TeamError('not-signed-in', msg);
  const has = (s: string) => msg.toLowerCase().includes(s);
  if (has('pgrst202') || has('could not find the function') || /^404\b/.test(msg)) return new TeamError('unavailable', msg);
  if (has('team is full')) return new TeamError('full', msg);
  if (has('already waiting')) return new TeamError('invite-waiting', msg);
  if (has('invitation expired')) return new TeamError('expired', msg);
  if (has('another google account')) return new TeamError('other-account', msg);
  if (has('no longer valid')) return new TeamError('no-longer-valid', msg);
  if (has('cannot invite yourself')) return new TeamError('self', msg);
  if (has('invalid email')) return new TeamError('invalid-email', msg);
  if (has('already in a team workspace')) return new TeamError('already-in-team', msg);
  if (has('own invitation')) return new TeamError('own-invite', msg);
  if (has('account disabled')) return new TeamError('disabled', msg);
  if (has('invitation not found')) return new TeamError('not-found', msg);
  if (has('no active team workspace')) return new TeamError('no-partner', msg);
  if (has('not allowed') || has('only your own') || has('only the owner') || code === 'auth') return new TeamError('not-allowed', msg);
  return new TeamError('other', msg);
}

/** Change 19/20: which team and sharing actions are noted in the usage log (the action only, never who or what). */
const FEATURE_OF: Record<string, string> = {
  eab_team_invite: 'team.invite', eab_team_accept: 'team.accept', eab_team_decline: 'team.decline', eab_team_leave: 'team.leave',
  eab_team_remove: 'team.remove', eab_share_set: 'share.set', eab_share_all_set: 'share.all', eab_request_delete: 'delete.request', eab_decide_delete: 'delete.decide',
};

/** Calls one database function as the signed-in person (refreshing the sign-in first when needed). */
export async function rpc<T>(store: Store, cfg: SyncConfig, fn: string, body: Record<string, unknown> = {}, fetchFn: FetchFn = fetch): Promise<T> {
  if (!configured(cfg)) throw new TeamError('not-signed-in');
  const s0 = store.getState().meta.syncSession;
  if (!s0) throw new TeamError('not-signed-in');
  try {
    const s = await fresh(cfg, s0, fetchFn);
    if (s !== s0) store.setSingleton('meta', { syncSession: s });
    const r = await supabaseCall(fetchFn, `${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: supabaseHeaders(cfg, s.accessToken), body: JSON.stringify(body) });
    const text = await r.text();
    if (FEATURE_OF[fn]) usage.feature(FEATURE_OF[fn]);
    return (text ? JSON.parse(text) : null) as T;
  } catch (e) { throw teamErrorOf(e); }
}

// ---------- status ----------
interface StatusJson {
  team: { id: string; created_by: string; created_at: string } | null;
  members: { user_id: string; email: string; name: string | null; joined_at: string }[];
  invites_sent: { id: string; email: string | null; created_at: string; expires_at: string }[];
  invites_for_me: { id: string; from_email: string; from_name: string | null; created_at: string; expires_at: string }[];
  shares_given: { workspace_id: string; collection: CollectionName; record_id: string; level: ShareLevel }[];
  share_all_given: { scope: ShareScope; level: ShareLevel }[];
  share_all_received: { scope: ShareScope; level: ShareLevel; owner_id: string }[];
  delete_requests: { id: string; workspace_id: string; collection: CollectionName; record_id: string; owner_id: string; requester_id: string; created_at: string }[];
}
export function teamFromStatus(j: StatusJson, at = Date.now()): TeamState {
  return {
    ...(j.team ? { id: j.team.id, createdBy: j.team.created_by, createdAt: j.team.created_at } : {}),
    members: (j.members ?? []).map((m): TeamMember => ({ userId: m.user_id, email: m.email, name: m.name ?? undefined, joinedAt: m.joined_at })),
    invitesSent: (j.invites_sent ?? []).map((i): TeamInvite => ({ id: i.id, email: i.email, createdAt: i.created_at, expiresAt: i.expires_at })),
    invitesForMe: (j.invites_for_me ?? []).map((i): TeamInvite => ({ id: i.id, fromEmail: i.from_email, fromName: i.from_name, createdAt: i.created_at, expiresAt: i.expires_at })),
    sharesGiven: (j.shares_given ?? []).map(s => ({ workspaceId: s.workspace_id, collection: s.collection, recordId: s.record_id, level: s.level })),
    shareAllGiven: (j.share_all_given ?? []).map(a => ({ scope: a.scope, level: a.level })),
    shareAllReceived: (j.share_all_received ?? []).map(a => ({ scope: a.scope, level: a.level, ownerId: a.owner_id })),
    deleteRequests: (j.delete_requests ?? []).map((d): DeleteRequest => ({ id: d.id, workspaceId: d.workspace_id, collection: d.collection, recordId: d.record_id, ownerId: d.owner_id, requesterId: d.requester_id, createdAt: d.created_at })),
    at,
  };
}

/** Reads my Team Workspace from the cloud and keeps it on the phone. A team that ended is dropped at once, and the
 *  view falls back to the Personal Workspace by itself (see access.currentView). */
export async function refreshTeam(store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch): Promise<TeamState> {
  const j = await rpc<StatusJson>(store, cfg, 'eab_team_status', {}, fetchFn);
  const team = teamFromStatus(j);
  store.setSingleton('meta', { team });
  return team;
}

// ---------- membership ----------
export interface InviteAnswer { invite_id: string; token: string; team_id: string; expires_at: string }
/** The link the other agent opens (or pastes) to accept. The token is shown once and never stored on the phone. */
export function inviteLink(token: string, base = typeof window === 'undefined' ? 'https://jslproperties101.github.io/estate-agent-buddy/' : `${window.location.origin}${window.location.pathname}`): string {
  return `${base}?team-invite=${encodeURIComponent(token)}`;
}
/** Reads an invitation token from a pasted link or a bare token. */
export function tokenFrom(text: string): string | undefined {
  const t = text.trim();
  const m = /[?&#]team-invite=([0-9a-f]{16,128})/i.exec(t);
  if (m) return m[1].toLowerCase();
  return /^[0-9a-f]{16,128}$/i.test(t) ? t.toLowerCase() : undefined;
}

export async function sendInvite(store: Store, cfg: SyncConfig, email: string | null, fetchFn: FetchFn = fetch): Promise<InviteAnswer> {
  const r = await rpc<InviteAnswer>(store, cfg, 'eab_team_invite', { p_email: email ? email.trim().toLowerCase() : null }, fetchFn);
  await refreshTeam(store, cfg, fetchFn).catch(() => undefined);
  return r;
}
export async function cancelInvite(store: Store, cfg: SyncConfig, inviteId: string, fetchFn: FetchFn = fetch) {
  await rpc(store, cfg, 'eab_team_cancel_invite', { p_invite: inviteId }, fetchFn);
  await refreshTeam(store, cfg, fetchFn).catch(() => undefined);
}
export async function acceptInvite(store: Store, cfg: SyncConfig, by: { token?: string; inviteId?: string }, fetchFn: FetchFn = fetch) {
  await rpc(store, cfg, 'eab_team_accept', { p_token: by.token ?? null, p_invite: by.inviteId ?? null }, fetchFn);
  await refreshTeam(store, cfg, fetchFn).catch(() => undefined);
}
export async function declineInvite(store: Store, cfg: SyncConfig, by: { token?: string; inviteId?: string }, fetchFn: FetchFn = fetch) {
  await rpc(store, cfg, 'eab_team_decline', { p_token: by.token ?? null, p_invite: by.inviteId ?? null }, fetchFn);
  await refreshTeam(store, cfg, fetchFn).catch(() => undefined);
}
/** Ends the Team Workspace (leave). Shared access is revoked immediately in the cloud; the phone drops every shared-in
 *  record straight away too (not only at the next sync). */
export async function leaveTeam(store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch) {
  await rpc(store, cfg, 'eab_team_leave', {}, fetchFn);
  dropAllShared(store);
  await refreshTeam(store, cfg, fetchFn).catch(() => store.setSingleton('meta', { team: undefined }));
}
export async function removeMember(store: Store, cfg: SyncConfig, userId: string, fetchFn: FetchFn = fetch) {
  await rpc(store, cfg, 'eab_team_remove', { p_user: userId }, fetchFn);
  dropAllShared(store);
  await refreshTeam(store, cfg, fetchFn).catch(() => store.setSingleton('meta', { team: undefined }));
}

// ---------- sharing ----------
export interface ShareItem { collection: CollectionName; id: string; level: ShareLevel | null }
export interface ShareResult { collection: string; id: string; status: 'ok' | 'not_owner' | 'not_shareable'; level?: ShareLevel | null }
/** Saves permission changes for selected records. Takes effect at once (no acceptance by the other agent). */
export async function setShares(store: Store, cfg: SyncConfig, items: ShareItem[], fetchFn: FetchFn = fetch): Promise<ShareResult[]> {
  const ws = store.getState().meta.syncSession?.workspaceId;
  if (!ws) throw new TeamError('not-signed-in');
  const out: ShareResult[] = [];
  for (let i = 0; i < items.length; i += 500) {
    out.push(...await rpc<ShareResult[]>(store, cfg, 'eab_share_set', { p_ws: ws, p_items: items.slice(i, i + 500).map(x => ({ collection: x.collection, id: x.id, level: x.level })) }, fetchFn));
  }
  await refreshTeam(store, cfg, fetchFn).catch(() => undefined);
  return out;
}
export async function setShareAll(store: Store, cfg: SyncConfig, scope: ShareScope, level: ShareLevel | null, fetchFn: FetchFn = fetch) {
  await rpc(store, cfg, 'eab_share_all_set', { p_scope: scope, p_level: level }, fetchFn);
  await refreshTeam(store, cfg, fetchFn).catch(() => undefined);
}

// ---------- deletion requests ----------
export async function requestDelete(store: Store, cfg: SyncConfig, collection: CollectionName, id: string, fetchFn: FetchFn = fetch): Promise<string> {
  const info = store.getState().meta.shared?.[`${collection}:${id}`];
  if (!info || info.level !== 'edit') throw new TeamError('not-allowed');
  const rid = await rpc<string>(store, cfg, 'eab_request_delete', { p_ws: info.workspaceId, p_coll: collection, p_id: id }, fetchFn);
  await refreshTeam(store, cfg, fetchFn).catch(() => undefined);
  return rid;
}
export async function decideDelete(store: Store, cfg: SyncConfig, requestId: string, approve: boolean, fetchFn: FetchFn = fetch) {
  await rpc(store, cfg, 'eab_decide_delete', { p_request: requestId, p_approve: approve }, fetchFn);
  await refreshTeam(store, cfg, fetchFn).catch(() => undefined);
}

/** Removes every record another agent shared with me from this phone (after leaving / being removed). */
export function dropAllShared(store: Store) {
  for (const key of Object.keys(store.getState().meta.shared ?? {})) {
    const i = key.indexOf(':');
    store.forgetRecord(key.slice(0, i) as CollectionName, key.slice(i + 1));
  }
  // Team Workspace events: only the person who created the Team Workspace keeps reviewing them after it ends.
  const st = store.getState();
  if (st.meta.team?.createdBy !== (st.meta.syncSession?.userId ?? 'local')) store.forgetAudit('team');
  store.setSingleton('meta', { shared: {} });
}
