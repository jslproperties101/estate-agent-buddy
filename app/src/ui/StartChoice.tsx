// New user, first start (after sign-in when Google sign-in is set up): fill the app with example data to try it
// out, or start with a clean, empty workspace. Asked once per phone, only while the phone holds no records — so an
// agent whose team data arrives from the cloud is never asked, and a clean workspace stays empty.
import { useState } from 'react';
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { isEmptyWorkspace, loadSampleInto } from '../data/sample';
import { IconLogo } from '../icons';
import { titled3 } from '../lib/titleCase';

const T = titled3( {
  en: {
    title: 'Welcome to EA AI Buddy',
    body: 'How would you like to start?',
    sample: 'Populate with Sample Data', recommended: 'Recommended',
    sampleSub: 'Example properties, buyers, vendors, to-dos, calendar events, inquiries and viewings, all marked “Sample”, so you can see how everything works. Remove them any time in Settings → Sample data. Sample data stays on this phone and is never sent to your team.',
    empty: 'Start Without Sample Data', emptySub: 'A clean, empty workspace for your real work. You can still add sample data later in Settings.',
  },
  bm: {
    title: 'Selamat datang ke EA AI Buddy',
    body: 'Bagaimana anda mahu bermula?',
    sample: 'Isi dengan Data Contoh', recommended: 'Disyorkan',
    sampleSub: 'Contoh hartanah, pembeli, penjual, tugasan, acara kalendar, pertanyaan dan lawatan, semuanya bertanda “Contoh”, supaya anda boleh lihat cara semuanya berfungsi. Buang bila-bila masa di Tetapan → Data contoh. Data contoh kekal di telefon ini dan tidak dihantar kepada pasukan anda.',
    empty: 'Mula Tanpa Data Contoh', emptySub: 'Ruang kerja kosong untuk kerja sebenar anda. Anda masih boleh menambah data contoh kemudian di Tetapan.',
  },
  zh: {
    title: '欢迎使用 EA AI Buddy',
    body: '您想如何开始？',
    sample: '填入示例数据', recommended: '推荐',
    sampleSub: '示例房产、买家、卖家、待办、日历活动、询问和看房，全部标有“示例”，让您了解各项功能如何运作。可随时在 设置 → 示例数据 中删除。示例数据只保存在本机，不会发送给您的团队。',
    empty: '不使用示例数据开始', emptySub: '干净、空白的工作区，用于真实工作。以后仍可在设置中添加示例数据。',
  },
});

/** Shown when this is a new, empty workspace and the choice was never made on this phone. */
export function needsStartChoice(state: ReturnType<ReturnType<typeof useApp>['store']['getState']>): boolean {
  if (state.settings.startChoice) return false;
  // Signed in: wait until the first sync has brought down any team records before deciding the workspace is new.
  if (state.meta.syncSession && !state.meta.lastSync && !state.meta.syncError) return false;
  return isEmptyWorkspace(state as unknown as Record<string, unknown>);
}

export function StartChoice({ lang }: { lang: Lang }) {
  const { store } = useApp();
  const t = T[lang];
  const [busy, setBusy] = useState(false);
  return (
    <div className="sheet-scrim start-scrim" role="presentation">
      <div className="sheet start-choice" role="dialog" aria-modal="true" aria-labelledby="sc-t" data-testid="start-choice">
        <span className="start-logo"><IconLogo size={96} big /></span>
        <h2 id="sc-t">{t.title}</h2>
        <p className="muted">{t.body}</p>
        <button className="choice-card rec" disabled={busy} data-testid="start-sample" onClick={() => {
          setBusy(true);
          loadSampleInto(store);
          store.setSingleton('settings', { startChoice: 'sample' });
        }}>
          <span className="between"><strong>{t.sample}</strong><span className="badge rec-badge">{t.recommended}</span></span>
          <small>{t.sampleSub}</small>
        </button>
        <button className="choice-card" disabled={busy} data-testid="start-empty" onClick={() => store.setSingleton('settings', { startChoice: 'empty' })}>
          <strong>{t.empty}</strong>
          <small>{t.emptySub}</small>
        </button>
      </div>
    </div>
  );
}
