// Change 010: the audit-history export screen (preview and confirmation first, progress with Cancel, then save/share
// or keep in the app) and Export Management (Saved Exports and Deleted Exports).
import { useRemembered } from '../ui/screenMemory';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import type { Go } from '../nav';
import { useApp } from '../data/useStore';
import { useToast } from '../ui/toast';
import { Confirm, Tabs } from '../ui/common';
import { shareOrDownload } from '../lib/pdfRender';
import { ACTION_FILTERS, ActionFilter, fmtMyt, ymdMyt } from '../audit/model';
import { auditStrings } from '../audit/strings';
import { actorLabel } from '../audit/AuditUI';
import { gather, generate, prepare, ExportResult } from './generate';
import { estimateBytes, fmtBytes, LARGE_BYTES, Report, ExportFormat, ExportMode, recLine } from './report';
import { keepExport, listExports, bulk, refusedFor, canAccessExport, canDeleteExport, SavedExport, BulkResult } from './saved';
import { exportStrings, EXACT_EXPORT } from './strings';

// ---------- export ----------
export function AuditExportScreen({ lang, go, keys, person: person0, actions: actions0 }: { lang: Lang; go: Go; keys: string[]; person?: string; actions?: string[] }) {
  const { state, store } = useApp();
  const s = exportStrings[lang];
  const a = auditStrings[lang];
  const toast = useToast();
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [mode, setMode] = useState<ExportMode>('history');
  const [person, setPerson] = useState(person0 ?? '');
  const [actions, setActions] = useState<ActionFilter[]>((actions0 as ActionFilter[] | undefined) ?? ACTION_FILTERS);
  const [preview, setPreview] = useState<Report | null>(null);
  const [problem, setProblem] = useState('');
  const [people, setPeople] = useState<[string, string][]>([]);
  const [phase, setPhase] = useState<'preview' | 'running' | 'done'>('preview');
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const cancelRef = useRef(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [msg, setMsg] = useState('');
  const [keptRef, setKeptRef] = useState('');

  useEffect(() => {
    let live = true;
    setProblem('');
    void prepare(store, lang, { keys, format, mode, person: person || undefined, actions }).then(r => { if (live) setPreview(r); }, e => { if (live) { setPreview(null); setProblem(String(e?.message) === 'not-allowed' ? s.notAllowed : s.failed); } });
    void gather(store).then(({ audit }) => {
      if (!live) return;
      const m = new Map<string, string>();
      for (const k of keys) for (const e of audit.get(k) ?? []) m.set(e.actorId, actorLabel(state, e, lang));
      setPeople([...m.entries()]);
    });
    return () => { live = false; };
  }, [format, mode, person, actions, keys.join(','), store.auditEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  const est = preview ? estimateBytes(preview) : 0;
  const run = async () => {
    cancelRef.current = false;
    setPhase('running'); setMsg(''); setProgress([0, 0]);
    try {
      const r = await generate(store, lang, { keys, format, mode, person: person || undefined, actions }, { onProgress: (d, t) => setProgress([d, t]), cancelled: () => cancelRef.current });
      setResult(r); setPhase('done');
    } catch (e) {
      setPhase('preview');
      const m = String((e as Error)?.message);
      setMsg(m === 'cancelled' ? s.cancelled : m === 'not-allowed' ? s.notAllowed : s.failed);
      if (m !== 'cancelled') toast(s.failed, 'error');
    }
  };

  if (!keys.length) return <section className="stack"><div className="card"><p>{s.noRecords}</p></div></section>;
  return (
    <section className="stack" data-testid="audit-export">
      <p className="notice" data-testid="export-warning"><span className="confidential">{EXACT_EXPORT[lang].confidential}</span> · {EXACT_EXPORT[lang].warning}</p>
      {phase !== 'done' && (
        <div className="card stack-sm">
          <div className="card-title">{s.format}</div>
          <div className="seg" role="group" aria-label={s.format}>
            {(['pdf', 'xlsx'] as ExportFormat[]).map(f => <button key={f} aria-pressed={format === f} disabled={phase === 'running'} data-format={f} onClick={() => setFormat(f)}>{f === 'pdf' ? s.pdf : s.xlsx}</button>)}
          </div>
          <div className="card-title">{s.mode}</div>
          <div className="seg" role="group" aria-label={s.mode}>
            <button aria-pressed={mode === 'history'} disabled={phase === 'running'} data-mode="history" onClick={() => setMode('history')}>{s.historyOnly}</button>
            <button aria-pressed={mode === 'snapshot'} disabled={phase === 'running'} data-mode="snapshot" onClick={() => setMode('snapshot')}>{s.withSnapshot}</button>
          </div>
          {mode === 'snapshot' && <small className="muted">{s.snapshotHelp}</small>}
          <label className="ff">{s.person}
            <select value={person} disabled={phase === 'running'} onChange={e => setPerson(e.target.value)} data-testid="export-person">
              <option value="">{s.everyone}</option>{people.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
          </label>
          <div className="row-wrap" role="group" aria-label={s.actions}>
            {ACTION_FILTERS.map(f => <label key={f} className="check"><input type="checkbox" disabled={phase === 'running'} checked={actions.includes(f)} data-export-action={f} onChange={e => setActions(e.target.checked ? [...actions, f] : actions.filter(x => x !== f))} /> {a.filter[f]}</label>)}
          </div>
          <small className="muted">{s.allHistory}</small>
        </div>
      )}

      {phase === 'preview' && (
        <div className="card stack-sm" data-testid="export-preview">
          <div className="card-title">{s.preview}</div>
          {problem ? <p className="warn-text" role="alert">{problem}</p> : !preview ? null : <>
            <dl className="dl">
              <div className="dl-row"><dt>{s.scope}</dt><dd data-testid="preview-scope">{preview.records.length === 1 ? s.oneRecord(recLine(preview.records[0])) : s.manyRecords(preview.records.length)}</dd></div>
              <div className="dl-row"><dt>{s.filters}</dt><dd>{s.scopeLine(mode === 'snapshot' ? s.withSnapshot : s.historyOnly, preview.personLabel ?? s.everyone, actions.length === ACTION_FILTERS.length ? s.allActions : actions.map(x => a.filter[x]).join(', '))}</dd></div>
              <div className="dl-row"><dt>{s.recordCount}</dt><dd data-testid="preview-records">{preview.records.length}</dd></div>
              <div className="dl-row"><dt>{s.entryCount}</dt><dd data-testid="preview-entries">{preview.count}</dd></div>
              <div className="dl-row"><dt>{s.estSize}</dt><dd data-testid="preview-size">{fmtBytes(est)}</dd></div>
            </dl>
            {(est > LARGE_BYTES || preview.count > 1500) && <p className="warn-text" data-testid="export-large">{s.bigWarning}</p>}
            <button className="btn primary" data-testid="export-generate" disabled={!actions.length} onClick={() => void run()}>{s.generate}</button>
          </>}
          {msg && <p className="small" role="status" data-testid="export-msg">{msg}</p>}
        </div>
      )}

      {phase === 'running' && (
        <div className="card stack-sm" data-testid="export-running" role="status">
          <strong>{s.generating}</strong>
          <div className="progress" aria-hidden="true"><span style={{ width: `${progress[1] ? Math.round((progress[0] / progress[1]) * 100) : 5}%` }} /></div>
          {progress[1] > 0 && <small className="muted">{s.progress(progress[0], progress[1])}</small>}
          <button className="btn secondary" data-testid="export-cancel" onClick={() => { cancelRef.current = true; }}>{s.cancel}</button>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="card stack-sm" data-testid="export-done">
          <div className="card-title">{s.ready}</div>
          <dl className="dl">
            <div className="dl-row"><dt>{s.fileName}</dt><dd className="wrap-anywhere" data-testid="export-filename">{result.fileName}</dd></div>
            <div className="dl-row"><dt>{s.refCode}</dt><dd data-testid="export-ref">{result.report.ref}</dd></div>
            <div className="dl-row"><dt>{s.estSize}</dt><dd>{fmtBytes(result.blob.size)}</dd></div>
          </dl>
          <button className="btn primary" data-testid="export-share" onClick={() => void shareOrDownload(result.blob, result.fileName, result.fileName, result.mime).then(r => toast(r === 'shared' ? s.shared : r === 'downloaded' ? s.downloaded : r === 'cancelled' ? s.cancelled : s.shareFailed, r === 'shared' || r === 'downloaded' || r === 'cancelled' ? 'ok' : 'error'))}>{s.saveShare}</button>
          <button className="btn secondary" data-testid="export-keep" disabled={keptRef === result.report.ref} onClick={() => void keepExport(store, {
            ref: result.report.ref, fileName: result.fileName, format: result.report.format, mode: result.report.mode,
            recordIds: result.report.records.map(r => r.recordId), recordKeys: result.report.records.map(r => r.key),
            ownerIds: result.report.records.map(r => store.getState().meta.shared?.[r.key]?.ownerId ?? (store.getState().meta.syncSession?.userId ?? 'local')),
            exporterId: result.report.exporter.id, exporterLabel: result.report.exporter.label, at: result.report.at,
          }, result.blob).then(() => { setKeptRef(result.report.ref); toast(s.kept); }, () => toast(s.failed, 'error'))}>{s.keepInApp}</button>
          {keptRef && <button className="btn ghost" onClick={() => go({ name: 'exports', section: 'saved' })}>{s.manageTitle}</button>}
        </div>
      )}
    </section>
  );
}

// ---------- Export Management ----------
type Section = 'saved' | 'deleted';
export function ExportManagementScreen({ lang, go, section }: { lang: Lang; go: Go; section?: Section }) {
  const { state, store } = useApp();
  const s = exportStrings[lang];
  const toast = useToast();
  // Q120: the section used last is remembered; search and filters are not.
  const [tab, setTabRaw] = useState<Section>(section ?? state.settings.exportSection ?? 'saved');
  const setTab = (t: Section) => { setSel([]); setTabRaw(t); store.setSingleton('settings', { exportSection: t }); };
  const [all, setAll] = useState<SavedExport[] | null>(null);
  const [q, setQ] = useRemembered('q', '');
  const [fRec, setFRec] = useState('');
  const [fDate, setFDate] = useState('');
  const [fFmt, setFFmt] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [ask, setAsk] = useState<null | { op: 'delete' | 'purge' | 'restore'; refs: string[]; refused?: SavedExport[] }>(null);
  const [failed, setFailed] = useState<{ op: 'delete' | 'purge' | 'restore'; refs: string[] } | null>(null);
  useEffect(() => { let live = true; void listExports(store).then(x => { if (live) setAll(x); }); return () => { live = false; }; }, [store, store.exportsEpoch]);
  // Q117: any change to the search or the filters (or the section) clears the selection.
  useEffect(() => { setSel([]); }, [q, fRec, fDate, fFmt, tab]);

  const inTab = (all ?? []).filter(e => (tab === 'deleted' ? !!e.deletedAt : !e.deletedAt));
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => inTab
    .filter(e => !needle || e.fileName.toLowerCase().includes(needle) || e.ref.toLowerCase().includes(needle) || e.recordIds.some(r => r.toLowerCase().includes(needle)))
    .filter(e => (!fRec || e.recordIds.includes(fRec)) && (!fFmt || e.format === fFmt) && (!fDate || ymdMyt(e.at) === fDate.replace(/-/g, '')))
    .sort((x, y) => (tab === 'deleted' ? (y.deletedAt ?? 0) - (x.deletedAt ?? 0) : y.at - x.at)), [all, tab, needle, fRec, fFmt, fDate]); // eslint-disable-line react-hooks/exhaustive-deps
  const recordChoices = [...new Set(inTab.flatMap(e => e.recordIds))].sort();

  const start = async (op: 'delete' | 'purge' | 'restore', refs: string[]) => {
    // Q118: permissions are checked again now; files no longer allowed are named and the person decides.
    const refused = await refusedFor(store, refs, op);
    if (refused.length === refs.length) { toast(s.noneAllowed, 'error'); return; }
    if (refused.length) { setAsk({ op, refs: refs.filter(r => !refused.some(x => x.ref === r)), refused }); return; }
    if (op === 'restore') { void act(op, refs); return; }                 // Q109: restore needs no extra confirmation
    setAsk({ op, refs });
  };
  const act = async (op: 'delete' | 'purge' | 'restore', refs: string[]) => {
    const r: BulkResult = await bulk(store, refs, op);
    setSel([]);
    if (r.failed.length) { setFailed({ op, refs: r.failed }); toast(s.someFailed(r.failed.length), 'error'); }     // Q105, Q119
    else { setFailed(null); toast(s.okAll); }
  };
  const nameOf = (ref: string) => (all ?? []).find(e => e.ref === ref)?.fileName ?? ref;
  const open = async (e: SavedExport) => {
    if (!canAccessExport(store.getState(), e)) { toast(exportStrings[lang].notAllowed, 'error'); return; }
    const blob = await store.getFile(e.fileId);
    if (!blob) { toast(s.openFailed, 'error'); return; }
    const r = await shareOrDownload(blob, e.fileName, e.fileName, blob.type || (e.format === 'pdf' ? 'application/pdf' : 'application/octet-stream'));
    if (r === 'failed' || r === 'needApk') toast(s.openFailed, 'error');
  };

  return (
    <section className="stack" data-testid="export-management">
      <Tabs label={s.manageTitle} value={tab} onChange={setTab} options={[{ value: 'saved', label: s.saved }, { value: 'deleted', label: s.deleted }]} />
      <div className="card stack-sm">
        {tab === 'saved' ? <small className="muted">{s.savedHelp}</small> : <>
          <strong data-testid="retention-message">{EXACT_EXPORT[lang].kept}</strong>
          <small className="muted">{s.keptHelp}</small>
          <strong data-testid="deleted-count">{s.totalDeleted(inTab.length)}</strong>
        </>}
        <label className="ff">{s.search}<input value={q} onChange={e => { setSel([]); setQ(e.target.value); }} data-field="exportSearch" /></label>
        <div className="filter-grid">
          <label>{s.fRecord}<select value={fRec} onChange={e => { setSel([]); setFRec(e.target.value); }} data-testid="filter-record"><option value="">{s.any}</option>{recordChoices.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
          <label>{s.fFormat}<select value={fFmt} onChange={e => { setSel([]); setFFmt(e.target.value); }} data-testid="filter-format"><option value="">{s.any}</option><option value="pdf">PDF</option><option value="xlsx">XLSX</option></select></label>
          <label>{s.fDate}<input type="date" value={fDate} onChange={e => { setSel([]); setFDate(e.target.value); }} data-testid="filter-date" /></label>
        </div>
      </div>

      <div className="card stack-sm" data-testid={tab === 'saved' ? 'saved-list' : 'deleted-list'}>
        {!all ? null : inTab.length === 0 ? <small className="muted">{tab === 'saved' ? s.noSaved : s.noDeleted}</small> : shown.length === 0 ? <small className="muted">{s.noMatch}</small> : <>
          <div className="row-wrap">
            <button className="btn small secondary" data-testid="select-all" onClick={() => setSel(shown.map(e => e.ref))}>{s.selectAll(shown.length)}</button>
            {sel.length > 0 && <button className="btn small ghost" onClick={() => setSel([])}>{s.clearSel}</button>}
            <strong data-testid="selected-count">{s.selectedN(sel.length)}</strong>
          </div>
          <div className="row-wrap">
            {tab === 'saved' && <button className="btn small danger" disabled={!sel.length} data-testid="bulk-delete" onClick={() => void start('delete', sel)}>{s.deleteSel}</button>}
            {tab === 'deleted' && <>
              <button className="btn small primary" disabled={!sel.length} data-testid="bulk-restore" onClick={() => void start('restore', sel)}>{s.restoreSel}</button>
              <button className="btn small danger" disabled={!sel.length} data-testid="bulk-purge" onClick={() => void start('purge', sel)}>{s.deletePerm}</button>
            </>}
          </div>
          {shown.map(e => (
            <div key={e.ref} className="export-row" data-testid="export-item" data-ref={e.ref}>
              <input type="checkbox" aria-label={e.fileName} checked={sel.includes(e.ref)} onChange={x => setSel(v => (x.target.checked ? [...v, e.ref] : v.filter(r => r !== e.ref)))} />
              <div className="meta">
                <strong className="wrap-anywhere">{e.fileName}</strong>
                <small>{e.format.toUpperCase()} · {s.recordId}: {e.recordIds.join(', ')}</small>
                <small>{s.refCode}: {e.ref}</small>
                <small className="muted">{s.exportedOn}: {fmtMyt(e.at)} · {s.exporter}: {e.exporterLabel}</small>
                {tab === 'deleted' && <small className="muted" data-testid="deleted-info">{s.deletedOn}: {fmtMyt(e.deletedAt!)} · {s.deletedBy}: {e.deletedByLabel || '—'}</small>}
                {!canDeleteExport(state, e) && <small className="muted">{s.ownerOnly}</small>}
                {tab === 'saved' && <button className="btn small secondary fit" data-testid="export-open" onClick={() => void open(e)}>{s.open}</button>}
              </div>
            </div>
          ))}
        </>}
        {failed && (
          <div className="sub-card stack-sm" role="alert" data-testid="bulk-failed">
            <strong>{s.failedFiles}</strong>
            {failed.refs.map(r => <small key={r} className="wrap-anywhere">{nameOf(r)}</small>)}
            <button className="btn small secondary" data-testid="bulk-retry" onClick={() => void act(failed.op, failed.refs)}>{s.retry}</button>
          </div>
        )}
      </div>
      <button className="btn ghost" onClick={() => go({ name: 'auditSearch' })}>{auditStrings[lang].searchTitle}</button>

      {ask && ask.refused && (
        <Confirm lang={lang} danger={false} title={s.noAccessQ(ask.refused.length)} body={s.noAccessBody(ask.refused.map(e => e.fileName).join(', '))} okLabel={s.continueRest}
          onCancel={() => setAsk(null)} onOk={() => { const x = ask; setAsk(x.op === 'restore' ? null : { op: x.op, refs: x.refs }); if (x.op === 'restore') void act('restore', x.refs); }} />
      )}
      {ask && !ask.refused && ask.op !== 'restore' && (
        <Confirm lang={lang} title={ask.op === 'delete' ? s.deleteQ(ask.refs.length) : s.deletePermQ(ask.refs.length)} body={ask.op === 'delete' ? s.deleteBody : s.deletePermBody}
          okLabel={ask.op === 'delete' ? s.deleteSel : s.deletePerm} onCancel={() => setAsk(null)} onOk={() => { const x = ask; setAsk(null); void act(x.op, x.refs); }} />
      )}
    </section>
  );
}
