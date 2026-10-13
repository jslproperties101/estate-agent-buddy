// The note at the top of a form that has a draft: what happened, and a clear way to throw the draft away.
import type { Lang } from '../i18n';
import { fmtDateTime } from '../lib/dates';
import type { DraftHandle } from './useDraft';

const en = {
  restored: (t: string) => `Draft from ${t} restored. It is not saved yet: press Save to keep it.`,
  stale: (t: string) => `A draft from ${t} was found, but this record has changed since then. Autosave is paused until you choose.`,
  changed: 'This record was updated while you were editing (for example from another phone). If you save, those updates are replaced; the earlier version stays in History.',
  useDraft: 'Use my draft', discard: 'Discard draft', saved: 'Draft saved on this phone', discardAsk: 'Discard this draft?',
};
type S = typeof en;
const bm: S = {
  restored: t => `Draf daripada ${t} dipulihkan. Ia belum disimpan: tekan Simpan untuk mengekalkannya.`,
  stale: t => `Draf daripada ${t} ditemui, tetapi rekod ini telah berubah sejak itu. Simpan auto dijeda sehingga anda memilih.`,
  changed: 'Rekod ini dikemas kini semasa anda menyunting (contohnya dari telefon lain). Jika anda menyimpan, kemas kini itu diganti; versi terdahulu kekal dalam Sejarah.',
  useDraft: 'Guna draf saya', discard: 'Buang draf', saved: 'Draf disimpan dalam telefon ini', discardAsk: 'Buang draf ini?',
};
const zh: S = {
  restored: t => `已恢复 ${t} 的草稿。尚未保存：请按“保存”以保留。`,
  stale: t => `找到 ${t} 的草稿，但此记录自那时起已更改。选择之前自动保存已暂停。`,
  changed: '您编辑时此记录已被更新（例如来自另一部手机）。如果保存，这些更新将被替换；之前的版本仍保留在历史记录中。',
  useDraft: '使用我的草稿', discard: '放弃草稿', saved: '草稿已保存在本手机', discardAsk: '放弃此草稿？',
};
export const draftStrings: Record<Lang, S> = { en, bm, zh };

export function DraftBanner({ lang, draft }: { lang: Lang; draft: DraftHandle }) {
  const s = draftStrings[lang];
  const n = draft.notice;
  return (
    <div className="stack-sm" data-testid="draft-area">
      {n && (
        <div className="notice draft-notice" role="status" data-testid="draft-banner" data-kind={n.kind}>
          <p>{n.kind === 'restored' ? s.restored(fmtDateTime(n.savedAt, lang)) : n.kind === 'stale' ? s.stale(fmtDateTime(n.savedAt, lang)) : s.changed}</p>
          <div className="row-wrap">
            {n.kind === 'stale' && <button type="button" className="btn small secondary" data-testid="draft-use" onClick={draft.useDraft}>{s.useDraft}</button>}
            {n.kind !== 'changed-underneath' && <button type="button" className="btn small ghost danger-text" data-testid="draft-discard" onClick={draft.discard}>{s.discard}</button>}
          </div>
        </div>
      )}
      {draft.saved && !n && (
        <div className="between"><small className="muted" data-testid="draft-saved">{s.saved}</small>
          <button type="button" className="btn small ghost" data-testid="draft-discard" onClick={draft.discard}>{s.discard}</button></div>
      )}
    </div>
  );
}
