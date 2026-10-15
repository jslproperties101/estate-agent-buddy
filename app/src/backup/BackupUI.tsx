// Settings → Backup and restore. Making a backup hands one .zip to the phone's share sheet (or downloads it); restoring
// reads a chosen .zip, checks it completely, shows exactly what would change, and only then applies it (src/backup/backup.ts).
// Google Drive (Change 006): daily restore points (restorePoints.ts) and readable folders (driveTree.ts); restore from a
// restore point or from an older .zip on Drive goes through the same check → preview → confirm → safety copy path.
import { useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { shareOrDownload } from '../lib/pdfRender';
import { config } from '../config';
import { startDriveConnect } from '../data/auth';
import { downloadBackup, driveUsable, ensureFolder, listBackups, runDriveBackup, DriveFile } from './drive';
import { DriveClient } from './driveApi';
import { createRestorePoint, drFolders, listPoints, loadRestorePoint, PointInfo } from './restorePoints';
import { forgetTree } from './driveTree';
import { fmtDateTime } from '../lib/dates';
import { backupStrings } from './strings';
import { createBackup, inspectBackup, noteBackupMade, planRestore, restoreBackup, Inspection, RestoreMode, RestorePlan } from './backup';

/** A Drive backup older than this is called out (Settings and Notifications). */
export const STALE_MS = 2 * 24 * 3600_000;
/** …and shown in red after a week (Change 006 design: amber after 2 days, red after 7). */
export const VERY_STALE_MS = 7 * 24 * 3600_000;

export function BackupCard({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const t = backupStrings[lang];
  const [busy, setBusy] = useState<'' | 'making' | 'reading' | 'restoring'>('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [insp, setInsp] = useState<Inspection | null>(null);
  const [mode, setMode] = useState<RestoreMode>('missing');
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMsg, setDriveMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[] | null>(null);
  const [points, setPoints] = useState<PointInfo[] | null>(null);
  const [fromPoint, setFromPoint] = useState<PointInfo | null>(null);
  const meta = state.meta;
  const signedIn = !!meta.syncSession;
  const usable = driveUsable(meta.drive);

  const connect = async () => {
    setDriveMsg(null);
    try { await startDriveConnect(config(state.settings)); } catch { setDriveMsg({ text: t.driveFail.network, bad: true }); }
  };
  const driveNow = async () => {
    setDriveBusy(true); setDriveMsg(null);
    const r = await runDriveBackup(store, fetch, Date.now(), { force: true });
    if (r.point) setDriveMsg({ text: t.driveOk(r.point.kept, r.point.name) });
    else setDriveMsg({ text: t.driveFail[r.pointError ?? r.error ?? 'server'] ?? t.driveFail.server, bad: true });
    setDriveBusy(false);
  };
  const rebuild = async () => {
    setDriveBusy(true); setDriveMsg(null);
    await forgetTree(store);
    const r = await runDriveBackup(store, fetch, Date.now(), { force: false });
    setDriveMsg(r.tree ? { text: t.rebuildDone } : { text: t.driveFail[r.treeError ?? r.error ?? 'server'] ?? t.driveFail.server, bad: true });
    setDriveBusy(false);
  };
  const showPoints = async () => {
    setDriveBusy(true); setDriveMsg(null);
    try { const d = new DriveClient(fetch, meta.drive!.token); const l = (await listPoints(d, await drFolders(d))).complete; setPoints(l); if (!l.length) setDriveMsg({ text: t.pointsNone }); }
    catch { setDriveMsg({ text: t.driveListFail, bad: true }); }
    setDriveBusy(false);
  };
  const usePoint = async (p: PointInfo) => {
    setDriveBusy(true); setDriveMsg({ text: t.pointChecking }); setMsg(null); setInsp(null); setPlan(null);
    try {
      const d = new DriveClient(fetch, meta.drive!.token);
      const r = await loadRestorePoint(d, await drFolders(d), p);
      if ('problem' in r || !r.inspection.ok) setDriveMsg({ text: 'problem' in r ? t.pointBad : (t.problem[r.inspection.problems[0]] ?? t.pointBad), bad: true });
      else { setDriveMsg(null); setFromPoint(p); setInsp(r.inspection); setPlan(await planRestore(store, r.inspection, mode)); }
    } catch { setDriveMsg({ text: t.driveListFail, bad: true }); }
    setDriveBusy(false);
  };
  const showDrive = async () => {
    setDriveBusy(true); setDriveMsg(null);
    try { const tok = meta.drive!.token; const folder = await ensureFolder(fetch, tok); const l = await listBackups(fetch, tok, folder); setDriveFiles(l); if (!l.length) setDriveMsg({ text: t.driveNone }); }
    catch { setDriveMsg({ text: t.driveListFail, bad: true }); }
    setDriveBusy(false);
  };
  const useDriveFile = async (f: DriveFile) => {
    setDriveBusy(true); setDriveMsg(null); setMsg(null);
    try {
      const i = await inspectBackup(await downloadBackup(fetch, meta.drive!.token, f.id));
      if (!i.ok) setMsg({ text: t.problem[i.problems[0]] ?? t.problem.damaged, bad: true });
      else { setFromPoint(null); setInsp(i); setPlan(await planRestore(store, i, mode)); }
    } catch { setDriveMsg({ text: t.driveListFail, bad: true }); }
    setDriveBusy(false);
  };

  const make = async () => {
    setBusy('making'); setMsg(null);
    try {
      const b = await createBackup(store);
      const r = await shareOrDownload(new Blob([b.bytes as BlobPart], { type: 'application/zip' }), b.fileName, t.title, 'application/zip');
      if (r === 'cancelled') setMsg(null);
      else if (r === 'failed') setMsg({ text: t.makeFailed, bad: true });
      else { noteBackupMade(store); setMsg({ text: `${t.made(b.records, b.files)}${b.missingFiles.length ? ` ${t.madeMissing(b.missingFiles.length)}` : ''}` }); }
    } catch { setMsg({ text: t.makeFailed, bad: true }); }
    setBusy('');
  };

  const choose = async (file?: File) => {
    if (!file) return;
    setBusy('reading'); setMsg(null); setInsp(null); setPlan(null);
    try {
      const i = await inspectBackup(new Uint8Array(await file.arrayBuffer()));
      if (!i.ok) setMsg({ text: t.problem[i.problems[0]] ?? t.problem.damaged, bad: true });
      else { setInsp(i); setPlan(await planRestore(store, i, mode)); }
    } catch { setMsg({ text: t.problem.damaged, bad: true }); }
    setBusy('');
  };
  const pick = async (m: RestoreMode) => { setMode(m); if (insp) setPlan(await planRestore(store, insp, m)); };
  const apply = async () => {
    if (!insp) return;
    setBusy('restoring'); setMsg(null);
    try {
      // Change 006: before a restore, a restore point of the phone as it is now (when Drive can be used). The local
      // safety copy inside restoreBackup is always made; this extra Drive copy is best effort.
      if (meta.syncSession && driveUsable(meta.drive)) { try { await createRestorePoint(store, new DriveClient(fetch, meta.drive!.token), 'before-restore'); } catch { /* the safety copy below still protects the phone */ } }
      const r = await restoreBackup(store, insp, mode);
      setMsg({ text: t.done(r.added, r.replaced, r.filesRestored) }); setInsp(null); setPlan(null); setFromPoint(null);
    } catch (e) {
      const m = /^refused:(.+)$/.exec((e as Error).message);
      setMsg({ text: m ? (t.refusal[m[1]] ?? t.failed) : t.failed, bad: true });
    }
    setBusy('');
  };

  const total = insp ? Object.values(insp.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="card stack-sm" data-testid="backup-card">
      <div className="card-title">{t.title}</div>
      <small className="muted">{t.hint}</small>
      <small className="muted" data-testid="backup-last">{state.meta.lastBackupAt ? t.last(fmtDateTime(state.meta.lastBackupAt, lang)) : t.never}</small>
      <button className="btn primary" data-testid="backup-make" disabled={!!busy} onClick={make}>{busy === 'making' ? t.making : t.make}</button>
      <div className="card-title">{t.restoreTitle}</div>
      <small className="muted">{t.restoreHint}</small>
      <label className="btn secondary" aria-disabled={!!busy}>
        {busy === 'reading' ? t.reading : t.choose}
        <input type="file" accept=".zip,application/zip" hidden data-testid="backup-file" disabled={!!busy} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {insp && plan && (
        <div className="stack-sm" data-testid="backup-preview">
          <small>{t.made_at(fmtDateTime(insp.manifest!.createdAt, lang))}{fromPoint ? ` · ${fromPoint.name}` : ''}</small>
          <small>{t.contains(total, insp.files)}</small>
          {plan.refusal
            ? <small role="alert" className="warn-text" data-testid="backup-refused">{t.refusal[plan.refusal]}</small>
            : <>
              <label className="check"><input type="radio" name="bk-mode" checked={mode === 'missing'} onChange={() => void pick('missing')} /> {t.modeMissing}</label>
              <label className="check"><input type="radio" name="bk-mode" checked={mode === 'all'} onChange={() => void pick('all')} /> {t.modeAll}</label>
              <small data-testid="backup-plan">{t.plan(plan.add.length, plan.replace.length, plan.kept, plan.files)}</small>
              {signedIn && usable && <small className="muted">{t.pointBefore}</small>}
              <button className="btn primary" data-testid="backup-restore" disabled={!!busy} onClick={apply}>{busy === 'restoring' ? t.restoring : t.restore}</button>
            </>}
          <button className="btn ghost" onClick={() => { setInsp(null); setPlan(null); setFromPoint(null); }}>{t.cancel}</button>
        </div>
      )}
      {msg && <small role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'warn-text' : 'ok-text'} data-testid="backup-msg">{msg.text}</small>}
      <div className="card-title">{t.driveTitle}</div>
      <small className="muted">{t.driveHint}</small>
      <small className="muted">{t.driveLimit}</small>
      {!signedIn ? <small className="muted" data-testid="drive-need-signin">{t.driveNotSetUp}</small> : <>
        <small data-testid="drive-state">{usable ? t.connected(fmtDateTime(meta.drive!.expiresAt, lang)) : t.notConnected}</small>
        <small className={meta.driveLastOkAt && Date.now() - meta.driveLastOkAt <= STALE_MS ? 'muted' : meta.driveLastOkAt && Date.now() - meta.driveLastOkAt <= VERY_STALE_MS ? 'warn-text' : 'warn-text danger-text'} data-testid="drive-last">
          {meta.driveLastOkAt ? (Date.now() - meta.driveLastOkAt > VERY_STALE_MS ? t.driveVeryStale(fmtDateTime(meta.driveLastOkAt, lang)) : Date.now() - meta.driveLastOkAt > STALE_MS ? t.driveStale(fmtDateTime(meta.driveLastOkAt, lang)) : t.driveLastOk(fmtDateTime(meta.driveLastOkAt, lang))) : t.driveNever}
        </small>
        <small className={meta.driveTree && (!meta.driveTree.ok || meta.driveTree.status === 'partial') ? 'warn-text' : 'muted'} data-testid="drive-tree">
          {!meta.driveTree ? t.treeNever : !meta.driveTree.ok ? t.treeFailed(t.driveFail[meta.driveTree.error ?? 'server'] ?? t.driveFail.server) : t.treeLast(fmtDateTime(meta.driveTree.at, lang), meta.driveTree.status === 'complete', meta.driveTree.waiting ?? 0, meta.driveTree.failed ?? 0)}
        </small>
        {!!meta.driveTree?.editedOutside && <small className="warn-text" data-testid="drive-tree-edited">{t.treeEdited(meta.driveTree.editedOutside)}</small>}
        <button className="btn secondary" data-testid="drive-connect" disabled={driveBusy} onClick={connect}>{t.connect}</button>
        {usable && <>
          <button className="btn primary" data-testid="drive-now" disabled={driveBusy} onClick={driveNow}>{driveBusy ? t.driveBusy : t.driveNow}</button>
          <button className="btn secondary" data-testid="drive-points" disabled={driveBusy} onClick={showPoints}>{t.pointsList}</button>
          <button className="btn ghost" data-testid="drive-rebuild" disabled={driveBusy} onClick={rebuild}>{t.rebuild}</button>
          <button className="btn ghost" data-testid="drive-list" disabled={driveBusy} onClick={showDrive}>{t.driveList}</button>
        </>}
        {points && points.map(p => (
          <div className="row" key={p.id} data-testid="drive-point"><small>{fmtDateTime(p.createdAt, lang)}</small><button className="btn small ghost" disabled={driveBusy} onClick={() => void usePoint(p)}>{t.pointUse}</button></div>
        ))}
        {driveFiles && driveFiles.length > 0 && <small className="muted">{t.oldZips}</small>}
        {driveFiles && driveFiles.map(f => (
          <div className="row" key={f.id} data-testid="drive-file"><small>{f.name}</small><button className="btn small ghost" disabled={driveBusy} onClick={() => void useDriveFile(f)}>{t.driveRestore}</button></div>
        ))}
        {driveMsg && <small role={driveMsg.bad ? 'alert' : 'status'} className={driveMsg.bad ? 'warn-text' : 'ok-text'} data-testid="drive-msg">{driveMsg.text}</small>}
      </>}
    </div>
  );
}
