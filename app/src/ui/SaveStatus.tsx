// One line under the header that says, truthfully, where the latest changes are: saved on this phone, syncing,
// synced, or failed. See data/savestate.ts for what each word means.
import type { Lang } from '../i18n';
import { useApp, useSaveState } from '../data/useStore';
import { saveStrings } from './savestrings';

export function SaveStatus({ lang }: { lang: Lang }) {
  const state = useSaveState();
  const { state: app } = useApp();
  const s = saveStrings[lang];
  const waiting = app.meta.dirty.length;
  const text = state === 'phone' ? (app.meta.syncSession && waiting > 0 ? s.phoneWaiting(waiting) : s.phone)
    : state === 'syncing' ? s.syncing
      : state === 'synced' ? s.synced
        : state === 'failed-sync' ? s.failedSync : s.failedPhone;
  return (
    <div className={`save-status ${state}`} role={state.startsWith('failed') ? 'alert' : 'status'} data-testid="save-status" data-state={state} aria-label={s.label}>
      <span className="save-dot" aria-hidden="true" />{text}
    </div>
  );
}
