// Change 010 D: View History (collapsed, at the bottom of a record's detail screen) and the cross-record Audit History
// search. Who may see what is checked with the access policy every time the list is drawn: a record no longer shared
// with me disappears from search and its history is already forgotten on this phone.
import { useEffect, useMemo, useState } from 'react';
import type { Lang } from '../i18n';
import type { Go } from '../nav';
import { useApp } from '../data/useStore';
import type { AppState, CollectionName } from '../data/types';
import { COLLECTIONS } from '../data/types';
import { Confirm } from '../ui/common';
import { useToast } from '../ui/toast';
import { recordTitle, fieldLabel } from '../sync/SyncUI';
import { config } from '../config';
import { can, labelForUser, personLabel, myId, sharedInfo } from '../team/access';
import { teamStrings } from '../team/strings';
import { rpc } from '../team/api';
import type { Store } from '../data/store';
import { AuditEntry, ACTION_FILTERS, ActionFilter, filterOf, fmtMyt, showValue, newestFirst, ymdMyt } from './model';
import { auditStrings } from './strings';

// ---------- who may see which history ----------
/** May I see this record's audit history right now? "team" = Team Workspace events kept on this phone. A record I own
 *  that was deleted keeps its history visible to me; anyone else's needs current access to the record. */
export function auditVisible(state: AppState, key: string, entries: AuditEntry[]): boolean {
  if (key === 'team') return true;
  const i = key.indexOf(':');
  const c = key.slice(0, i) as CollectionName, id = key.slice(i + 1);
  if (!(COLLECTIONS as string[]).includes(c)) return false;
  if ((state[c] as unknown as { id: string }[]).some(r => r.id === id)) return can(state, 'viewAudit', c, id);
  if (sharedInfo(state, c, id)) return false;
  const me = myId(state);
  return entries.length > 0 && entries.every(e => !e.ownerId || e.ownerId === me || e.ownerId === 'local');
}

/** The audit entries of one record, redrawn when they change. */
export function useAudit(key: string | undefined): AuditEntry[] | null {
  const { store, state } = useApp();
  const [list, setList] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    if (!key) { setList([]); return; }
    void store.auditEntries(key).then(x => { if (live) setList(x); });
    return () => { live = false; };
  }, [key, store, store.auditEpoch, state]);
  return list;
}

/** Every visible entry on this phone, keyed by record. */
export async function allVisibleAudit(store: Store): Promise<Map<string, AuditEntry[]>> {
  const out = new Map<string, AuditEntry[]>();
  for (const k of await store.auditKeys()) {
    const list = await store.auditEntries(k);
    if (list.length && auditVisible(store.getState(), k, list)) out.set(k, list);
  }
  return out;
}

export const actorLabel = (state: AppState, e: AuditEntry, lang: Lang) =>
  e.actorName || e.actorEmail ? personLabel(e.actorName, e.actorEmail) : e.actorId === 'local' ? (personLabel(state.profile.fullName, state.profile.email, auditStrings[lang].thisPhone)) : labelForUser(state, e.actorId);

/** One line that says what an entry was, in the person's language. */
export function entrySummary(_state: AppState, e: AuditEntry, lang: Lang): string {
  const a = auditStrings[lang];
  const ts = teamStrings[lang];
  const lvl = (x: unknown) => (x === 'edit' ? ts.viewEdit : x === 'view' ? ts.viewOnly : ts.notShared);
  const d = e.detail ?? {};
  if (e.action === 'permission') {
    const base = a.perm(String(d.event ?? 'changed'), lvl(d.from), lvl(d.to));
    return d.via === 'share_all' ? `${base} · ${a.viaAll(ts.scope[String(d.scope) as 'properties'] ?? String(d.scope))}` : base;
  }
  if (e.action === 'membership') return `${a.member[String(d.event)] ?? a.action.membership}${d.email ? ` · ${String(d.email)}` : ''}`;
  if (e.action === 'export' && (d.event === 'export_copy_deleted' || d.event === 'export_copy_purged')) return a.copyDeleted(d.event === 'export_copy_purged', Number(d.count ?? 0), (d.refs as string[] | undefined ?? []).join(', '));
  if (e.action === 'export') return a.exportRef(String(d.ref ?? ''), String(d.format ?? ''));
  if (e.action === 'audit_delete') return a.deletedCount(Number(d.count ?? 0));
  if ((e.action === 'edit' || e.action === 'create') && e.changes?.length) return `${a.action[e.action]} · ${a.fieldsChanged(e.changes.length)}`;
  return a.action[e.action] ?? e.action;
}

// ---------- the list ----------
function EntryRow({ lang, e, collection, selectable, selected, onSelect }: { lang: Lang; e: AuditEntry; collection?: string; selectable?: boolean; selected?: boolean; onSelect?: (on: boolean) => void }) {
  const { state } = useApp();
  const a = auditStrings[lang];
  const changes = e.changes ?? [];
  return (
    <li className="audit-entry" data-testid="audit-entry" data-action={e.action}>
      <div className="row-gap">
        {selectable && <input type="checkbox" aria-label={entrySummary(state, e, lang)} checked={!!selected} onChange={x => onSelect?.(x.target.checked)} data-testid="audit-select" />}
        <details className="grow">
          <summary>
            <strong className={`act-${filterOf(e.action) === 'delete' ? 'delete' : e.action === 'create' ? 'edit' : filterOf(e.action)}`}>{entrySummary(state, e, lang)}</strong>
            <small className="muted" data-testid="audit-meta">{a.by(actorLabel(state, e, lang))} · {fmtMyt(e.at)}</small>
          </summary>
          {changes.length > 0 && (
            <ul className="audit-changes" data-testid="audit-changes">
              {changes.map((c, i) => (
                <li key={i}><strong>{fieldLabel(lang, (collection ?? e.collection ?? 'properties') as CollectionName, c.field)}</strong>{c.field.includes('.') ? <small className="muted"> ({c.field})</small> : null}<br />
                  <span className="audit-before">{a.before}: {showValue(c.before)}</span><br /><span className="audit-after">{a.after}: {showValue(c.after)}</span></li>
              ))}
            </ul>
          )}
          <small className="muted">{a.by(actorLabel(state, e, lang))} · {fmtMyt(e.at)}</small>
        </details>
      </div>
    </li>
  );
}

/** Person + action filters (all actions on by default). */
function Filters({ lang, entries, person, setPerson, actions, setActions }: {
  lang: Lang; entries: AuditEntry[]; person: string; setPerson: (p: string) => void; actions: ActionFilter[]; setActions: (a: ActionFilter[]) => void;
}) {
  const { state } = useApp();
  const a = auditStrings[lang];
  const people = useMemo(() => [...new Map(entries.map(e => [e.actorId, actorLabel(state, e, lang)])).entries()], [entries, state, lang]);
  return (
    <div className="stack-sm" data-testid="audit-filters">
      <label className="ff">{a.person}
        <select value={person} onChange={x => setPerson(x.target.value)} data-testid="audit-person">
          <option value="">{a.everyone}</option>{people.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <div className="row-wrap" role="group" aria-label={a.actions}>
        {ACTION_FILTERS.map(f => (
          <label key={f} className="check"><input type="checkbox" checked={actions.includes(f)} data-action-filter={f}
            onChange={x => setActions(x.target.checked ? [...actions, f] : actions.filter(y => y !== f))} /> {a.filter[f]}</label>
        ))}
      </div>
    </div>
  );
}
export const applyAuditFilters = (list: AuditEntry[], person: string, actions: ActionFilter[]) =>
  list.filter(e => (!person || e.actorId === person) && actions.includes(filterOf(e.action)));

/** View History: collapsed by default, at the bottom of a supported record's screen. */
export function ViewHistory({ lang, collection, id, go }: { lang: Lang; collection: CollectionName; id: string; go?: Go }) {
  const { state, store } = useApp();
  const a = auditStrings[lang];
  const toast = useToast();
  const key = `${collection}:${id}`;
  const all = useAudit(key);
  const [person, setPerson] = useState('');
  const [actions, setActions] = useState<ActionFilter[]>(ACTION_FILTERS);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [ask, setAsk] = useState(false);
  if (!can(state, 'viewAudit', collection, id)) return null;
  const list = applyAuditFilters(all ?? [], person, actions);
  const owner = can(state, 'deleteAudit', collection, id);
  return (
    <details className="card stack-sm view-history" data-testid="view-history">
      <summary><strong>{all ? a.viewHistoryN(all.length) : a.viewHistory}</strong></summary>
      <small className="muted">{a.help}</small>
      {all && all.length > 0 && <Filters lang={lang} entries={all} person={person} setPerson={setPerson} actions={actions} setActions={setActions} />}
      {!all ? null : list.length === 0 ? <small className="muted" data-testid="audit-empty">{a.none}</small> : (
        <ul className="act-list" data-testid="audit-list">
          {list.map(e => <EntryRow key={e.id} lang={lang} e={e} collection={collection} selectable={selecting && e.action !== 'audit_delete'} selected={sel.includes(e.id)} onSelect={on => setSel(s => (on ? [...s, e.id] : s.filter(x => x !== e.id)))} />)}
        </ul>
      )}
      <div className="row-wrap">
        {go && <button className="btn small secondary" data-testid="export-history" onClick={() => go({ name: 'auditExport', keys: [key] })}>{a.exportHistory}</button>}
        {go && <button className="btn small secondary" onClick={() => go({ name: 'auditSearch' })}>{a.searchAll}</button>}
        {owner && !selecting && (all?.length ?? 0) > 0 && <button className="btn small ghost danger-text" data-testid="audit-delete-mode" onClick={() => { setSelecting(true); setSel([]); }}>{a.deleteOld}</button>}
        {selecting && <>
          <button className="btn small danger" disabled={!sel.length} data-testid="audit-delete-selected" onClick={() => setAsk(true)}>{a.deleteSelected(sel.length)}</button>
          <button className="btn small secondary" onClick={() => { setSelecting(false); setSel([]); }}>{a.cancelSelect}</button>
        </>}
      </div>
      <small className="muted">{a.restoreNote}</small>
      {ask && <Confirm lang={lang} title={a.deleteQ(sel.length)} body={a.deleteBody} okLabel={a.deleteSelected(sel.length)} onCancel={() => setAsk(false)}
        onOk={() => { setAsk(false); void deleteAudit(store, key, sel).then(n => { toast(a.deletedMsg(n)); setSelecting(false); setSel([]); }, () => toast(a.deleteFailed, 'error')); }} />}
    </details>
  );
}

/** Deletes old entries of a record (owner only, checked again now). Entries the cloud already has are deleted there first
 *  (it keeps its own backup); if that fails, nothing is deleted anywhere. */
export async function deleteAudit(store: Store, key: string, ids: string[]): Promise<number> {
  const i = key.indexOf(':');
  if (!can(store.getState(), 'deleteAudit', key.slice(0, i) as CollectionName, key.slice(i + 1))) throw new Error('not allowed');
  const list = await store.auditEntries(key);
  const inCloud = list.filter(e => ids.includes(e.id) && e.seq !== undefined).map(e => e.id);
  if (inCloud.length) await rpc(store, config(store.getState().settings), 'eab_audit_delete', { p_ids: inCloud });
  return store.deleteAuditEntries(key, ids);
}

// ---------- cross-record search ----------
export function AuditSearchScreen({ lang, go, collection, id }: { lang: Lang; go: Go; collection?: CollectionName; id?: string }) {
  const { state, store } = useApp();
  const a = auditStrings[lang];
  const [data, setData] = useState<Map<string, AuditEntry[]> | null>(null);
  const [q, setQ] = useState(() => (collection && id ? recordTitle(lang, collection, (state[collection] as unknown as Record<string, unknown>[]).find(r => r.id === id)) : ''));
  const [person, setPerson] = useState('');
  const [actions, setActions] = useState<ActionFilter[]>(ACTION_FILTERS);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => { let live = true; void allVisibleAudit(store).then(m => { if (live) setData(m); }); return () => { live = false; }; }, [store, store.auditEpoch, state]);
  const titleOf = (k: string) => {
    if (k === 'team') return a.teamEvents;
    const i = k.indexOf(':'); const c = k.slice(0, i) as CollectionName;
    return recordTitle(lang, c, (state[c] as unknown as Record<string, unknown>[]).find(r => r.id === k.slice(i + 1)));
  };
  const needle = q.trim().toLowerCase();
  const inDates = (e: AuditEntry) => (!from || ymdMyt(e.at) >= from.replace(/-/g, '')) && (!to || ymdMyt(e.at) <= to.replace(/-/g, ''));
  const groups = [...(data ?? new Map()).entries()].map(([k, list]) => {
    const title = titleOf(k);
    const hit = (e: AuditEntry) => !needle || title.toLowerCase().includes(needle) || actorLabel(state, e, lang).toLowerCase().includes(needle)
      || (e.changes ?? []).some(c => c.field.toLowerCase().includes(needle) || showValue(c.after).toLowerCase().includes(needle) || showValue(c.before).toLowerCase().includes(needle));
    return { k, title, list: applyAuditFilters(list, person, actions).filter(e => hit(e) && inDates(e)).sort(newestFirst) };
  }).filter(g => g.list.length).sort((x, y) => y.list[0].at - x.list[0].at);
  const total = groups.reduce((n, g) => n + g.list.length, 0);
  const allEntries = [...(data ?? new Map()).values()].flat();
  const keys = groups.map(g => g.k).filter(k => k !== 'team');
  return (
    <section className="stack" data-testid="audit-search">
      <div className="card stack-sm">
        <small className="muted">{a.searchHelp}</small>
        <label className="ff">{a.search}<input value={q} onChange={x => setQ(x.target.value)} data-field="auditSearch" /></label>
        <Filters lang={lang} entries={allEntries} person={person} setPerson={setPerson} actions={actions} setActions={setActions} />
        <div className="two">
          <label className="ff">{a.from}<input type="date" value={from} onChange={x => setFrom(x.target.value)} /></label>
          <label className="ff">{a.to}<input type="date" value={to} onChange={x => setTo(x.target.value)} /></label>
        </div>
        <small className="muted">{a.dateHint}</small>
        <strong data-testid="audit-count">{a.results(total, groups.length)}</strong>
        {keys.length > 0 && <button className="btn primary" data-testid="export-search" onClick={() => go({ name: 'auditExport', keys, person: person || undefined, actions: actions.length === ACTION_FILTERS.length ? undefined : actions })}>{a.exportHistory}</button>}
      </div>
      {groups.map(g => (
        <div key={g.k} className="card stack-sm" data-testid="audit-group">
          <div className="between"><strong>{g.title}</strong>
            {g.k !== 'team' && <button className="btn small secondary" onClick={() => { const i = g.k.indexOf(':'); const c = g.k.slice(0, i), rid = g.k.slice(i + 1);
              go(c === 'properties' ? { name: 'listingDetail', id: rid } : c === 'contacts' ? { name: 'contactDetail', id: rid } : c === 'tasks' ? { name: 'taskForm', id: rid } : c === 'appointments' ? { name: 'apptForm', id: rid } : { name: 'history', collection: c as CollectionName, id: rid }); }}>{a.openRecord}</button>}
          </div>
          <ul className="act-list">{g.list.map(e => <EntryRow key={e.id} lang={lang} e={e} />)}</ul>
        </div>
      ))}
    </section>
  );
}
