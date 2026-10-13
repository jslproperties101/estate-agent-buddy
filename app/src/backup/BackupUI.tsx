// Settings → Backup and restore. Making a backup hands one .zip to the phone's share sheet (or downloads it); restoring
// reads a chosen .zip, checks it completely, shows exactly what would change, and only then applies it (src/backup/backup.ts).
import { useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { shareOrDownload } from '../lib/pdfRender';
import { fmtDateTime } from '../lib/dates';
import { backupStrings } from './strings';
import { createBackup, inspectBackup, noteBackupMade, planRestore, restoreBackup, Inspection, RestoreMode, RestorePlan } from './backup';

export function BackupCard({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const t = backupStrings[lang];
  const [busy, setBusy] = useState<'' | 'making' | 'reading' | 'restoring'>('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [insp, setInsp] = useState<Inspection | null>(null);
  const [mode, setMode] = useState<RestoreMode>('missing');
  const [plan, setPlan] = useState<RestorePlan | null>(null);

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
    </div>
  );
}
