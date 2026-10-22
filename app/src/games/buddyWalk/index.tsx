// PLACEHOLDER: replaced by the Buddy Walk builder (Opus). Keeps the registry compiling until then.
import type { GameDef } from '../types';
export const game: GameDef = {
  key: 'buddyWalk',
  title: { en: 'Buddy Walk', bm: 'Buddy Walk', zh: 'Buddy 漫步' },
  blurb: { en: 'Walk through your listings in 3D.', bm: 'Berjalan melalui senarai anda dalam 3D.', zh: '以 3D 方式走过您的房源。' },
  icon: () => <svg aria-hidden="true" width={28} height={28} viewBox="0 0 24 24" fill="currentColor"><rect x="10" y="3" width="4" height="4" /><rect x="9" y="8" width="6" height="7" /><rect x="8" y="16" width="3" height="5" /><rect x="13" y="16" width="3" height="5" /></svg>,
  Component: ({ onExit }) => <div className="card"><p>Buddy Walk</p><button className="btn" onClick={onExit}>OK</button></div>,
};
