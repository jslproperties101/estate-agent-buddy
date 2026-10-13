// Settings → Backup and restore. Making a backup hands one .zip to the phone's share sheet (or downloads it); restoring
// reads a chosen .zip, checks it completely, shows exactly what would change, and only then applies it (src/backup/backup.ts).
import { useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { shareOrDownload } from '../lib/pdfRender';
import { config } from '../config';
import { startDriveConnect } from '../data/auth';
import { downloadBackup, driveUsable, ensureFolder, listBackups, runDriveBackup, DriveFile } from './drive';
import { fmtDateTime } from '../lib/dates';
import { backupStrings } from './strings';
import { createBackup, inspectBackup, noteBackupMade, planRestore, restoreBackup, Inspection, RestoreMode, RestorePlan } from './backup';

/** A Drive backup older than this is called out (Settings and Notifications). */
export const STALE_MS = 2 * 24 * 3600_000;

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
  const meta = state.meta;
  const signedIn = !!meta.syncSession;
  const usable = driveUsable(meta.drive);

  const connect = async () => {
    setDriveMsg(null);
    try { await startDriveConnect(config(state.settings)); } catch { setDriveMsg({ text: t.driveFail.network, bad: true }); }
  };
  const driveNow = async () => {
    setDriveBusy(true); setDriveMsg(null);
    const r = await runDriveBackup(store);
    setDriveMsg(r.ok ? { text: t.driveOk(r.run.copies, r.run.fileName) } : { text: t.driveFail[r.error] ?? t.driveFail.server, bad: true });
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
      else { setInsp(i); setPlan(await planRestore(store, i, mode)); }
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
      const r = await restoreBackup(store, insp, mode);
      setMsg({ text: t.done(r.added, r.replaced, r.filesRestored) }); setInsp(null); setPlan(null);
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
          <small>{t.made_at(fmtDateTime(insp.manifest!.createdAt, lang))}</small>
          <small>{t.contains(total, insp.files)}</small>
          {plan.refusal
            ? <small role="alert" className="warn-text" data-testid="backup-refused">{t.refusal[plan.refusal]}</small>
            : <>
              <label className="check"><input type="radio" name="bk-mode" checked={mode === 'missing'} onChange={() => void pick('missing')} /> {t.modeMissing}</label>
              <label className="check"><input type="radio" name="bk-mode" checked={mode === 'all'} onChange={() => void pick('all')} /> {t.modeAll}</label>
              <small data-testid="backup-plan">{t.plan(plan.add.length, plan.replace.length, plan.kept, plan.files)}</small>
              <button className="btn primary" data-testid="backup-restore" disabled={!!busy} onClick={apply}>{busy === 'restoring' ? t.restoring : t.restore}</button>
            </>}
          <button className="btn ghost" onClick={() => { setInsp(null); setPlan(null); }}>{t.cancel}</button>
        </div>
      )}
      {msg && <small role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'warn-text' : 'ok-text'} data-testid="backup-msg">{msg.text}</small>}
      <div className="card-title">{t.driveTitle}</div>
      <small className="muted">{t.driveHint}</small>
      <small className="muted">{t.driveLimit}</small>
      {!signedIn ? <small className="muted" data-testid="drive-need-signin">{t.driveNotSetUp}</small> : <>
        <small data-testid="drive-state">{usable ? t.connected(fmtDateTime(meta.drive!.expiresAt, lang)) : t.notConnected}</small>
        <small className={meta.driveLastOkAt && Date.now() - meta.driveLastOkAt <= STALE_MS ? 'muted' : 'warn-text'} data-testid="drive-last">
          {meta.driveLastOkAt ? (Date.now() - meta.driveLastOkAt > STALE_MS ? t.driveStale(fmtDateTime(meta.driveLastOkAt, lang)) : t.driveLastOk(fmtDateTime(meta.driveLastOkAt, lang))) : t.driveNever}
        </small>
        <button className="btn secondary" data-testid="drive-connect" disabled={driveBusy} onClick={connect}>{t.connect}</button>
        {usable && <>
          <button className="btn primary" data-testid="drive-now" disabled={driveBusy} onClick={driveNow}>{driveBusy ? t.driveBusy : t.driveNow}</button>
          <button className="btn ghost" data-testid="drive-list" disabled={driveBusy} onClick={showDrive}>{t.driveList}</button>
        </>}
        {driveFiles && driveFiles.map(f => (
          <div className="row" key={f.id} data-testid="drive-file"><small>{f.name}</small><button className="btn small ghost" disabled={driveBusy} onClick={() => void useDriveFile(f)}>{t.driveRestore}</button></div>
        ))}
        {driveMsg && <small role={driveMsg.bad ? 'alert' : 'status'} className={driveMsg.bad ? 'warn-text' : 'ok-text'} data-testid="drive-msg">{driveMsg.text}</small>}
      </>}
    </div>
  );
}
