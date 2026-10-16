// ClaudeChanges001 change 2 (owner, 17 Oct 2026): the "Saved on This Phone" line is gone from every screen. When something
// is wrong, one banner shows on the main page only, below the header line and above the cards:
//   sync failed      "3 listings not synced · Retrying in 42s" — the app tries again by itself every 60 seconds (no button)
//   phone storage    "Not saved: the phone's storage failed"
//   conflict         "1 record needs your review" — tapping it opens the review
// Nothing shows while everything is fine, and nothing shows on individual listings.
import { useEffect, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp, useSaveState } from '../data/useStore';
import { nextAutoSync } from '../data/syncRunner';
import { cc001Strings } from './cc001Strings';

/** Seconds until the next automatic try (60 when no time is known yet). */
export function secondsLeft(nextAt: number, now: number): number {
  if (!nextAt || nextAt <= now) return 60;
  return Math.min(60, Math.max(1, Math.ceil((nextAt - now) / 1000)));
}

export function SyncBanner({ lang, onReview }: { lang: Lang; onReview?: () => void }) {
  const st = useSaveState();
  const { state } = useApp();
  const t = cc001Strings[lang].sync;
  const [now, setNow] = useState(Date.now());
  const show = st === 'failed-sync' || st === 'failed-phone' || st === 'conflict';
  useEffect(() => {
    if (st !== 'failed-sync') return;
    const x = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(x);
  }, [st]);
  if (!show) return null;
  if (st === 'failed-phone') return <div className="sync-banner failed" role="alert" data-testid="sync-banner" data-state={st}><span aria-hidden="true">⚠</span><span>{t.phoneFailed}</span></div>;
  if (st === 'conflict') {
    const n = (state.meta.conflicts ?? []).length;
    return <button type="button" className="sync-banner conflict" data-testid="sync-banner" data-state={st} onClick={onReview}><span aria-hidden="true">⚠</span><span>{t.conflicts(n)}</span></button>;
  }
  const props = state.meta.dirty.filter(k => k.startsWith('properties:')).length;
  const what = props > 0 ? t.listings(props) : t.changes(Math.max(1, state.meta.dirty.length));
  return (
    <div className="sync-banner failed" role="status" data-testid="sync-banner" data-state={st}>
      <span aria-hidden="true">⚠</span><span data-testid="sync-banner-text">{what} · {t.retryIn(secondsLeft(nextAutoSync(), now))}</span>
    </div>
  );
}
