// Preview of a finished PDF (the real page pictures), with Share and Download. Shared by the calculator and the buyer PDF.
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import type { Doc } from '../lib/pdf';
import { download, pdfFileName, renderDocument, RenderedDoc, shareOrDownload } from '../lib/pdfRender';

const T = {
  en: { making: 'Making the PDF on this phone…', failed: 'The PDF could not be made on this phone. Nothing was changed.', page: (n: number, t: number) => `Page ${n} of ${t}`, share: 'Share PDF', save: 'Download PDF', close: 'Close', shared: 'Shared.', downloaded: 'PDF saved to your downloads.', cancelled: 'Sharing cancelled.', shareFailed: 'This phone could not share or save the file. Try Download PDF, or close and try again.', note: 'The PDF is made on this phone. Check it before you send it: it shows only what you ticked.', pages: (n: number) => `${n} page${n === 1 ? '' : 's'}` },
  bm: { making: 'Sedang membuat PDF pada telefon ini…', failed: 'PDF tidak dapat dibuat pada telefon ini. Tiada apa diubah.', page: (n: number, t: number) => `Halaman ${n} daripada ${t}`, share: 'Kongsi PDF', save: 'Muat turun PDF', close: 'Tutup', shared: 'Dikongsi.', downloaded: 'PDF disimpan dalam muat turun anda.', cancelled: 'Perkongsian dibatalkan.', shareFailed: 'Telefon ini tidak dapat berkongsi atau menyimpan fail. Cuba Muat turun PDF, atau tutup dan cuba lagi.', note: 'PDF dibuat pada telefon ini. Semak sebelum dihantar: ia hanya menunjukkan apa yang anda tanda.', pages: (n: number) => `${n} halaman` },
  zh: { making: '正在这部手机上生成 PDF…', failed: '这部手机无法生成 PDF。没有任何改动。', page: (n: number, t: number) => `第 ${n} 页，共 ${t} 页`, share: '分享 PDF', save: '下载 PDF', close: '关闭', shared: '已分享。', downloaded: 'PDF 已保存到下载内容。', cancelled: '已取消分享。', shareFailed: '这部手机无法分享或保存文件。请试试“下载 PDF”，或关闭后重试。', note: 'PDF 在这部手机上生成。发送前请检查：它只显示您勾选的内容。', pages: (n: number) => `${n} 页` },
};
export const pdfPreviewStrings = T;

export function PdfPreview({ lang, build, title, onClose }: { lang: Lang; build: () => Promise<Doc>; title: string; onClose: () => void }) {
  const t = T[lang];
  const [state, setState] = useState<'making' | 'ready' | 'failed'>('making');
  const [out, setOut] = useState<RenderedDoc | null>(null);
  const [msg, setMsg] = useState('');
  const urls = useRef<string[]>([]);
  const name = pdfFileName(title);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const doc = await build();
        const r = await renderDocument(doc, title);
        urls.current = r.previews;
        if (!alive) { r.previews.forEach(u => URL.revokeObjectURL(u)); return; }
        setOut(r); setState('ready');
      } catch { if (alive) setState('failed'); }
    })();
    return () => { alive = false; urls.current.forEach(u => URL.revokeObjectURL(u)); urls.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function share() {
    if (!out) return;
    const r = await shareOrDownload(out.pdf, name, title);
    setMsg(r === 'shared' ? t.shared : r === 'downloaded' ? t.downloaded : r === 'cancelled' ? t.cancelled : t.shareFailed);
  }
  function save() { if (!out) return; setMsg(download(out.pdf, name) ? t.downloaded : t.shareFailed); }

  return (
    <div className="scrim pdf-scrim" role="presentation">
      <div className="dialog pdf-dialog" role="dialog" aria-modal="true" aria-label={title} data-testid="pdf-preview">
        <h2 className="pdf-title">{title}</h2>
        {state === 'making' && <p role="status" data-testid="pdf-making">{t.making}</p>}
        {state === 'failed' && <p className="warn-text" role="alert" data-testid="pdf-failed">{t.failed}</p>}
        {state === 'ready' && out && (
          <>
            <small className="muted" data-testid="pdf-pages">{t.pages(out.previews.length)} · {Math.max(1, Math.round(out.pdf.size / 1024))} KB</small>
            <div className="pdf-pages">
              {out.previews.map((u, i) => <img key={u} src={u} alt={t.page(i + 1, out.previews.length)} className="pdf-page" data-testid="pdf-page" />)}
            </div>
            <small className="muted">{t.note}</small>
          </>
        )}
        {msg && <p className="voice-msg" role="status" data-testid="pdf-msg">{msg}</p>}
        <div className="two">
          <button className="btn secondary" onClick={onClose} data-testid="pdf-close">{t.close}</button>
          <button className="btn secondary" disabled={state !== 'ready'} onClick={save} data-testid="pdf-download">{t.save}</button>
        </div>
        <button className="btn primary" disabled={state !== 'ready'} onClick={share} data-testid="pdf-share">{t.share}</button>
      </div>
    </div>
  );
}
