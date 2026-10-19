// Download and Share for a finished file (Change 013). One shared pair of buttons, used by the PDF preview and the
// Marketing Studio. While a save or share is running both buttons are disabled (a second tap cannot start a second
// job), the file is kept until the hand-over has finished, and every outcome is said in words: saved and where, shared,
// cancelled, not possible here, or failed.
import { useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { saveFile, shareFile, openSaved } from '../lib/pdfRender';
import { c11Strings } from './c011Strings';
import { BusyLine } from './BusyLine';

export function FileActions({ lang, blob, fileName, title, mime = 'application/pdf', downloadLabel, shareLabel, disabled, testPrefix = 'pdf', onBusy }: {
  lang: Lang; blob: Blob | null | undefined; fileName: string; title: string; mime?: string; downloadLabel: string; shareLabel: string;
  disabled?: boolean; testPrefix?: string; onBusy?: (busy: boolean) => void;
}) {
  const f = c11Strings[lang].file;
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [msg, setMsg] = useState<{ text: string; error: boolean; open?: { uri: string; mime: string } } | null>(null);
  const running = useRef(false);
  async function run(kind: 'save' | 'share') {
    if (running.current) return;
    if (!blob) { setMsg({ text: f.noFile, error: true }); return; }
    running.current = true; setBusy(kind); setMsg(null); onBusy?.(true);
    // The file is held here until the phone has taken it, even if the preview is redrawn meanwhile.
    const held = blob;
    try {
      if (kind === 'save') {
        const r = await saveFile(held, fileName);
        // JoyChange003 Change 77: a short message, with an Open button when the phone can show the saved file.
        setMsg(r.ok ? { text: r.place === 'gallery' ? f.savedGallery : r.place === 'downloads' ? f.savedDownloads : r.where ? f.saved(r.where) : f.savedWeb, error: false, open: r.open } : { text: r.reason === 'needApk' ? f.needApk : r.reason === 'noFile' ? f.noFile : f.failed, error: true });
      } else {
        const r = await shareFile(held, fileName, title, mime);
        setMsg(r === 'shared' ? { text: f.shared, error: false } : r === 'cancelled' ? { text: f.cancelled, error: false }
          : r === 'unsupported' ? { text: f.unsupported, error: true } : r === 'needApk' ? { text: f.needApk, error: true } : { text: f.failed, error: true });
      }
    } catch { setMsg({ text: f.failed, error: true }); }
    finally { running.current = false; setBusy(null); onBusy?.(false); }
  }
  return (
    <div className="stack-sm" data-testid={`${testPrefix}-file-actions`}>
      <div className="btn-row">
        <button type="button" className="btn secondary" disabled={disabled || !!busy} onClick={() => void run('save')} data-testid={`${testPrefix}-download`}>{downloadLabel}</button>
        <button type="button" className="btn primary" disabled={disabled || !!busy} onClick={() => void run('share')} data-testid={`${testPrefix}-share`}>{shareLabel}</button>
      </div>
      {busy && <BusyLine text={busy === 'save' ? f.saving : f.sharing} testId={`${testPrefix}-file-busy`} />}
      {msg && (
        <div className="file-msg">
          <p className={msg.error ? 'warn-text small' : 'ok-text small'} role={msg.error ? 'alert' : 'status'} data-testid={`${testPrefix}-msg`}>{msg.text}</p>
          {msg.open && <button type="button" className="btn small primary" data-testid={`${testPrefix}-open`} onClick={() => { const o = msg.open!; void openSaved(o).then(ok => { if (!ok) setMsg({ text: f.openFail, error: true }); }); }}>{f.openFile}</button>}
        </div>
      )}
    </div>
  );
}
