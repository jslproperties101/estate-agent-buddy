// Data-safety screens: the state of one record, the sync review (conflicts and refused records), a record's history,
// recently deleted records, unsaved drafts, and the status of pictures and documents.
// Nothing on these screens deletes anything without an explicit choice, and every choice keeps the other version in History.
import { useEffect, useMemo, useState } from 'react';
import type { Lang } from '../i18n';
import type { Go, Screen } from '../nav';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { RecordState, recordStateOf } from '../data/recordstate';
import { resolveConflict, confirmOwner } from '../data/sync';
import { signOutRemote } from '../data/auth';
import { runSync } from '../data/syncRunner';
import { recordFileSummary, retryFile } from '../data/filesync';
import { fileRefs } from '../data/fileRefs';
import type { Revision } from '../data/store';
import type { CollectionName, Conflict, FieldConflict } from '../data/types';
import { fmtDateTime } from '../lib/dates';
import { cardTitle } from '../listing/model';
import { listingStrings } from '../listing/strings';
import { contactStrings } from '../contacts/strings';
import { saveStrings } from '../ui/savestrings';
import { Confirm, Empty } from '../ui/common';
import { syncStrings } from './strings';

type Rec = Record<string, unknown>;

/** A short name for any record, for lists. */
export function recordTitle(lang: Lang, collection: CollectionName, r: Rec | undefined): string {
  const s = syncStrings[lang];
  if (!r) return s.unknownRecord;
  if (collection === 'properties') return [r.ref, cardTitle(r as never)].filter(Boolean).join(' · ') || s.untitled;
  return String(r.name ?? r.title ?? r.headline ?? r.message ?? r.kind ?? '').trim().slice(0, 60) || s.untitled;
}

export function fieldLabel(lang: Lang, collection: CollectionName, field: string): string {
  const top = field.split('.')[0];
  if (collection === 'properties') { const l = listingStrings[lang].l[top]; if (l) return l; }
  if (collection === 'contacts') { const f = (contactStrings[lang].f as Record<string, string>)[top]; if (f) return f; }
  return top.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

function showVal(lang: Lang, v: unknown): string {
  const s = syncStrings[lang];
  if (v === undefined || v === null || v === '') return s.noValue;
  if (typeof v === 'string') return v.length > 140 ? `${v.slice(0, 140)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `${v.length} ×`;
  const j = JSON.stringify(v);
  return j.length > 140 ? `${j.slice(0, 140)}…` : j;
}

// ---------- one record's state ----------
export function RecordStatus({ lang, collection, id, go }: { lang: Lang; collection: CollectionName; id: string; go: Go }) {
  const { state, store } = useApp();
  const s = saveStrings[lang].rec;
  const y = syncStrings[lang];
  const [busy, setBusy] = useState(false);
  // Read through the store each time anything changes (the state depends on the sync, the drafts and the record itself).
  void state;
  const st: RecordState = recordStateOf(store, collection, id);
  const denied = state.meta.recErrors?.[`${collection}:${id}`] === 'denied';
  const files = collection === 'properties' ? recordFileSummary(store, collection, id) : null;
  return (
    <div className={`rec-status ${st}`} data-testid="record-status" data-state={st}>
      <div className="between">
        <span role={st === 'failed' ? 'alert' : 'status'}><span className="save-dot" aria-hidden="true" /> {s[st]}</span>
        <span className="row-wrap">
          {(st === 'failed' && !denied) && <button className="btn small secondary" disabled={busy} data-testid="rec-retry" onClick={async () => { setBusy(true); await runSync(store, config(store.getState().settings)); setBusy(false); }}>{busy ? y.syncing : s.retry}</button>}
          {st === 'conflict' && <button className="btn small secondary" data-testid="rec-review" onClick={() => go({ name: 'syncReview' })}>{s.review}</button>}
          <button className="btn small ghost" data-testid="rec-history" onClick={() => go({ name: 'history', collection, id })}>{y.history}</button>
        </span>
      </div>
      {denied && <small className="warn-text">{s.denied}</small>}
      {files && files.total > 0 && <FilesLine lang={lang} summary={files} />}
    </div>
  );
}

function FilesLine({ lang, summary }: { lang: Lang; summary: ReturnType<typeof recordFileSummary> }) {
  const y = syncStrings[lang];
  const bits = [y.fileLine(summary.uploaded, summary.total - summary.phoneOnly)];
  if (summary.phoneOnly) bits.push(y.filePhoneOnly(summary.phoneOnly));
  if (summary.waiting) bits.push(y.fileWaiting(summary.waiting));
  if (summary.failed) bits.push(y.fileFailed(summary.failed));
  if (summary.missing) bits.push(y.fileMissing(summary.missing));
  if (summary.denied) bits.push(y.fileDenied(summary.denied));
  return <small className="muted" data-testid="files-line">{y.files}: {bits.join(' · ')}</small>;
}

/** A small label for a picture or document that is not on this phone (or not in the cloud). */
export function FileBadge({ lang, fileId }: { lang: Lang; fileId?: string }) {
  const { store } = useApp();
  if (!fileId) return null;
  const e = store.fileEntry(fileId);
  if (!e || e.status === 'uploaded') return null;
  const y = syncStrings[lang];
  return (
    <span className={`file-badge ${e.status}`} data-testid="file-badge" data-state={e.status}>
      {y.fileState[e.status]}
      {(e.status === 'failed' || e.status === 'pending' || e.status === 'missing') && <button type="button" className="link-btn" onClick={() => retryFile(store, fileId)}>{y.retryFile}</button>}
    </span>
  );
}

// ---------- sync review ----------
function FieldConflictCard({ lang, conflict, go }: { lang: Lang; conflict: Conflict; go: Go }) {
  const { store } = useApp();
  const y = syncStrings[lang];
  const [pick, setPick] = useState<Record<string, 'local' | 'remote'>>({});
  const [msg, setMsg] = useState('');
  const fields = conflict.fields ?? [];
  const all = fields.every(f => pick[f.field]);
  const choose = (v: 'local' | 'remote') => setPick(Object.fromEntries(fields.map(f => [f.field, v])));
  const apply = async () => {
    resolveConflict(store, conflict.key, { fields: pick });
    setMsg(y.syncing);
    await runSync(store, config(store.getState().settings));
    setMsg(y.syncDone);
  };
  return (
    <div className="stack-sm">
      <p className="small">{y.fieldsHelp}</p>
      {fields.map((f: FieldConflict) => (
        <div key={f.field} className="sub-card stack-sm" data-testid="conflict-field" data-field={f.field}>
          <strong>{fieldLabel(lang, conflict.collection, f.field)}</strong>
          <div className="two">
            <button type="button" className={`pick ${pick[f.field] === 'local' ? 'on' : ''}`} aria-pressed={pick[f.field] === 'local'} data-testid="pick-mine" onClick={() => setPick(p => ({ ...p, [f.field]: 'local' }))}>
              <small className="muted">{y.thisPhone}</small><span>{showVal(lang, f.local)}</span><em>{y.useMine}</em>
            </button>
            <button type="button" className={`pick ${pick[f.field] === 'remote' ? 'on' : ''}`} aria-pressed={pick[f.field] === 'remote'} data-testid="pick-theirs" onClick={() => setPick(p => ({ ...p, [f.field]: 'remote' }))}>
              <small className="muted">{y.otherSide}</small><span>{showVal(lang, f.remote)}</span><em>{y.useTheirs}</em>
            </button>
          </div>
        </div>
      ))}
      <div className="row-wrap">
        <button type="button" className="btn small secondary" onClick={() => choose('local')}>{y.allMine}</button>
        <button type="button" className="btn small secondary" onClick={() => choose('remote')}>{y.allTheirs}</button>
        <button type="button" className="btn small ghost" onClick={() => go({ name: 'history', collection: conflict.collection, id: conflict.id })}>{y.history}</button>
      </div>
      <button type="button" className="btn primary" disabled={!all} data-testid="conflict-apply" onClick={apply}>{y.apply}</button>
      {msg && <small role="status" className="ok-text">{msg}</small>}
    </div>
  );
}

function ConflictCard({ lang, conflict, go }: { lang: Lang; conflict: Conflict; go: Go }) {
  const { state, store } = useApp();
  const y = syncStrings[lang];
  const rec = (state[conflict.collection] as unknown as Rec[]).find(r => r.id === conflict.id) ?? conflict.remote?.data ?? undefined;
  const [msg, setMsg] = useState('');
  const settle = async (whole: 'local' | 'remote') => {
    resolveConflict(store, conflict.key, { whole });
    setMsg(y.syncing);
    await runSync(store, config(store.getState().settings));
    setMsg(y.syncDone);
  };
  const title = { fields: y.fieldsTitle, 'deleted-remote': y.deletedRemoteTitle, 'deleted-local': y.deletedLocalTitle, reference: y.refTitle }[conflict.kind];
  return (
    <section className="card stack-sm" data-testid="conflict-card" data-kind={conflict.kind}>
      <div className="card-title">{recordTitle(lang, conflict.collection, rec as Rec | undefined)}</div>
      <strong>{title}</strong>
      {conflict.kind === 'fields' && <FieldConflictCard lang={lang} conflict={conflict} go={go} />}
      {conflict.kind === 'deleted-remote' && (<>
        <p className="small">{y.deletedRemoteHelp}</p>
        <div className="two"><button className="btn primary" data-testid="keep-mine" onClick={() => settle('local')}>{y.keepMine}</button><button className="btn secondary" data-testid="delete-too" onClick={() => settle('remote')}>{y.deleteToo}</button></div>
      </>)}
      {conflict.kind === 'deleted-local' && (<>
        <p className="small">{y.deletedLocalHelp}</p>
        <div className="two"><button className="btn primary" data-testid="bring-back" onClick={() => settle('remote')}>{y.bringBack}</button><button className="btn secondary" data-testid="delete-anyway" onClick={() => settle('local')}>{y.deleteAnyway}</button></div>
      </>)}
      {conflict.kind === 'reference' && conflict.ref && (<>
        <p className="small" data-testid="ref-conflict-text">{y.refHelp(conflict.ref.ref)}</p>
        <p className="small"><strong>{conflict.ref.otherVisible ? y.refUsedBy(conflict.ref.otherRef ?? '', conflict.ref.otherTitle ?? '') : y.refHidden}</strong></p>
        <div className="row-wrap">
          {conflict.ref.otherVisible && conflict.ref.otherId && <button className="btn small secondary" data-testid="open-other" onClick={() => go({ name: 'listingDetail', id: conflict.ref!.otherId! })}>{y.openThat}</button>}
          <button className="btn small primary" data-testid="change-number" onClick={() => go({ name: 'listingForm', id: conflict.id, section: 'basics' })}>{y.changeNumber}</button>
          <button className="btn small secondary" data-testid="check-again" onClick={() => settle('local')}>{y.checkAgain}</button>
        </div>
      </>)}
      {msg && <small role="status" className="ok-text">{msg}</small>}
    </section>
  );
}

export function SyncReviewScreen({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const y = syncStrings[lang];
  const conflicts = state.meta.conflicts ?? [];
  const errors = Object.entries(state.meta.recErrors ?? {});
  const problems = store.allFileEntries().filter(e => (e.status === 'failed' || e.status === 'denied' || e.status === 'missing') && fileRefs(state).some(r => r.fileId === e.id));
  return (
    <section className="stack" data-testid="sync-review">
      <p className="notice">{y.help}</p>
      {conflicts.length === 0 && errors.length === 0 && problems.length === 0 && <Empty>{y.noConflicts}</Empty>}
      {conflicts.map(c => <ConflictCard key={c.key} lang={lang} conflict={c} go={go} />)}
      {errors.length > 0 && (
        <section className="card stack-sm" data-testid="sync-errors">
          <div className="card-title">{y.failedTitle}</div>
          {errors.map(([key, why]) => {
            const [c, ...rest] = key.split(':');
            const id = rest.join(':');
            const rec = (state[c as CollectionName] as unknown as Rec[] | undefined)?.find(r => r.id === id);
            return (
              <div key={key} className="stack-sm"><strong>{recordTitle(lang, c as CollectionName, rec)}</strong>
                <small className="warn-text">{why === 'denied' ? y.failedDenied : y.failedOther}</small></div>
            );
          })}
        </section>
      )}
      {problems.length > 0 && (
        <section className="card stack-sm" data-testid="file-problems">
          <div className="card-title">{y.files}</div>
          {problems.map(e => {
            const ref = fileRefs(state).find(r => r.fileId === e.id)!;
            return <div key={e.id} className="between"><span className="small">{ref.name ?? ref.kind} <small className="muted">· {y.fileState[e.status]}</small></span><button className="btn small secondary" onClick={() => { retryFile(store, e.id); void runSync(store, config(store.getState().settings)); }}>{y.retryFile}</button></div>;
          })}
        </section>
      )}
    </section>
  );
}

// ---------- history ----------
export function HistoryScreen({ lang, collection, id, go }: { lang: Lang; collection: CollectionName; id: string; go: Go }) {
  const { state, store } = useApp();
  const y = syncStrings[lang];
  const key = `${collection}:${id}`;
  const rec = (state[collection] as unknown as Rec[]).find(r => r.id === id);
  const [revs, setRevs] = useState<Revision[] | null>(null);
  const [ask, setAsk] = useState<Revision | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { let live = true; void store.revisions(key).then(r => { if (live) setRevs(r); }); return () => { live = false; }; }, [store, key, rec]);
  const diff = (r: Revision): string[] => {
    const cur = (rec ?? {}) as Rec;
    return [...new Set([...Object.keys(r.data), ...Object.keys(cur)])].filter(k => k !== 'updated' && JSON.stringify(r.data[k]) !== JSON.stringify(cur[k])).slice(0, 6);
  };
  return (
    <section className="stack" data-testid="revision-history">
      <div className="card stack-sm">
        <div className="card-title">{recordTitle(lang, collection, rec ?? revs?.[0]?.data)}</div>
        <small className="muted">{y.historyHelp}</small>
        {!rec && <p className="warn-text small">{y.deletedNow}</p>}
        {rec && <small>{y.current}</small>}
      </div>
      {revs === null ? null : revs.length === 0 ? <Empty>{y.noHistory}</Empty> : (
        <ul className="stack-sm" data-testid="revision-list">
          {revs.map(r => (
            <li key={r.at} className="card stack-sm" data-testid="revision" data-source={r.source}>
              <div className="between"><strong>{fmtDateTime(r.at, lang)}</strong><small className="muted">{y.src[r.source] ?? r.source}</small></div>
              {rec && diff(r).length > 0 && <small className="muted">{y.changed}: {diff(r).map(k => fieldLabel(lang, collection, k)).join(', ')}</small>}
              <button className="btn small secondary" data-testid="restore-revision" onClick={() => setAsk(r)}>{y.restore}</button>
            </li>
          ))}
        </ul>
      )}
      {msg && <small role="status" className="ok-text" data-testid="history-msg">{msg}</small>}
      {ask && <Confirm lang={lang} title={y.restoreQ} body={y.restoreBody} danger={false} okLabel={y.restore} onCancel={() => setAsk(null)}
        onOk={async () => { const at = ask.at; setAsk(null); if (await store.restoreRevision(collection, id, at)) { setMsg(y.restored); if (!rec) go(collection === 'properties' ? { name: 'listingDetail', id } : collection === 'contacts' ? { name: 'contactDetail', id } : { name: 'home' }, { replace: true }); } }} />}
    </section>
  );
}

// ---------- recently deleted ----------
export function RecentlyDeletedScreen({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const y = syncStrings[lang];
  const [items, setItems] = useState<Awaited<ReturnType<typeof store.recentlyDeleted>> | null>(null);
  useEffect(() => { let live = true; void store.recentlyDeleted().then(r => { if (live) setItems(r); }); return () => { live = false; }; }, [store, state]);
  return (
    <section className="stack" data-testid="recently-deleted">
      <p className="notice">{y.recentHint}</p>
      {items && items.length === 0 && <Empty>{y.recentEmpty}</Empty>}
      <ul className="stack-sm">
        {(items ?? []).map(it => (
          <li key={it.key} className="card stack-sm" data-testid="deleted-item">
            <strong>{recordTitle(lang, it.collection, it.data)}</strong>
            <small className="muted">{y.deletedOn(fmtDateTime(it.at, lang))}</small>
            <button className="btn small secondary" data-testid="restore-deleted" onClick={async () => {
              const top = (await store.revisions(it.key))[0];
              if (top && await store.restoreRevision(it.collection, it.id, top.at)) go(it.collection === 'properties' ? { name: 'listingDetail', id: it.id } : it.collection === 'contacts' ? { name: 'contactDetail', id: it.id } : { name: 'home' }, { replace: true });
            }}>{y.restore}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- drafts ----------
export function routeForDraft(key: string, form: string, variant: unknown): Screen | null {
  const parts = key.split(':');
  const isNew = parts[1] === 'new';
  const id = isNew ? undefined : parts.slice(1).join(':');
  const v = (variant ?? {}) as Record<string, unknown>;
  switch (form) {
    case 'properties': return { name: 'listingForm', id, prefill: isNew ? (variant as never) : undefined };
    case 'contacts': return { name: 'contactForm', id, role: v.role as never, prefill: v.prefill as never };
    case 'tasks': return { name: 'taskForm', id, prefill: isNew ? (variant as never) : undefined };
    case 'inquiries': return { name: 'inquiryForm', id, propertyId: v.propertyId as string | undefined, contactId: v.contactId as string | undefined };
    case 'appointments': return { name: 'apptForm', id, ...(isNew ? (v as object) : {}) } as Screen;
    case 'deals': return { name: 'dealForm', id, propertyId: v.propertyId as string | undefined };
    default: return null;
  }
}

export function DraftsList({ lang, go }: { lang: Lang; go: Go }) {
  const { store } = useApp();
  const y = syncStrings[lang];
  const drafts = store.allDrafts();
  if (!drafts.length) return null;
  return (
    <ul className="notif-list" data-testid="drafts-list">
      {drafts.map(({ key, draft }) => {
        const route = routeForDraft(key, draft.form, draft.variant);
        const data = draft.data as Rec;
        const what = recordTitle(lang, draft.form as CollectionName, data);
        return (
          <li key={key} className="between" data-testid="draft-item">
            <span className="stack-sm"><strong>{y.draftFor(what)}</strong><small className="muted">{fmtDateTime(draft.savedAt, lang)}{key.includes(':new:') ? ` · ${y.newOne}` : ''}</small></span>
            <span className="row-wrap">
              {route && <button className="btn small secondary" data-testid="draft-continue" onClick={() => go(route)}>{y.continueDraft}</button>}
              <button className="btn small ghost danger-text" data-testid="draft-drop" onClick={() => store.discardDraft(key)}>{lang === 'zh' ? '放弃' : lang === 'bm' ? 'Buang' : 'Discard'}</button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- the card in Settings ----------
export function DataSafetyCard({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const y = syncStrings[lang];
  const [deleted, setDeleted] = useState(0);
  useEffect(() => { let live = true; void store.recentlyDeleted().then(r => { if (live) setDeleted(r.length); }); return () => { live = false; }; }, [store, state]);
  const n = (state.meta.conflicts ?? []).length + Object.keys(state.meta.recErrors ?? {}).length;
  const drafts = useMemo(() => store.allDrafts().length, [store, state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card stack-sm" data-testid="data-safety">
      <div className="card-title">{y.title}</div>
      <small className="muted">{y.help}</small>
      <button className="link-row" data-testid="open-sync-review" onClick={() => go({ name: 'syncReview' })}><strong>{y.review}</strong><small className="muted">{y.reviewHint(n)}</small></button>
      <button className="link-row" data-testid="open-recently-deleted" onClick={() => go({ name: 'recentlyDeleted' })}><strong>{y.recent}</strong><small className="muted">{deleted ? `${deleted}` : y.recentHint}</small></button>
      <div className="stack-sm"><strong>{y.drafts}</strong><small className="muted">{y.draftsHint(drafts)}</small><DraftsList lang={lang} go={go} /></div>
    </div>
  );
}

/** Shown instead of the app when the signed-in account's team differs from the team that owns the records on this phone.
 *  The old records stay on the phone untouched but are not shown, and nothing is sent or loaded. */
export function OtherWorkspaceScreen({ lang }: { lang: Lang }) {
  const { store } = useApp();
  const s = syncStrings[lang];
  return (
    <main className="screen" data-testid="other-workspace" role="alert" style={{ padding: 24 }}>
      <h1>{s.otherTitle}</h1>
      <p>{s.otherBody}</p>
      <button className="btn primary" data-testid="other-workspace-signout" onClick={() => {
        const m = store.getState().meta;
        void signOutRemote(config(store.getState().settings), m.syncSession!).catch(() => undefined);
        store.setSingleton('meta', { syncSession: undefined, syncError: undefined });
      }}>{s.otherSignOut}</button>
    </main>
  );
}

/** Shown when real records are on this phone but nothing says which team they belong to (the phone was last used by an
 *  older version and signed out). Nothing is sent, loaded or deleted until the person decides. */
export function OwnerUnknownScreen({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const s = syncStrings[lang];
  const [ask, setAsk] = useState(false);
  const team = state.meta.syncSession?.workspaceName ?? '—';
  return (
    <main className="screen" data-testid="owner-unknown" role="alert" style={{ padding: 24 }}>
      <h1>{s.unkTitle}</h1>
      <p>{s.unkBody(team)}</p>
      <button className="btn primary" data-testid="owner-confirm" onClick={() => setAsk(true)}>{s.unkConfirm(team)}</button>
      <button className="btn secondary" data-testid="owner-signout" onClick={() => {
        const m = store.getState().meta;
        void signOutRemote(config(store.getState().settings), m.syncSession!).catch(() => undefined);
        store.setSingleton('meta', { syncSession: undefined, syncError: undefined });
      }}>{s.otherSignOut}</button>
      {ask && <Confirm lang={lang} title={s.unkConfirmQ} body={s.unkConfirmBody(team)} okLabel={s.unkConfirmOk} danger={false} onCancel={() => setAsk(false)}
        onOk={() => { setAsk(false); confirmOwner(store); }} />}
    </main>
  );
}
