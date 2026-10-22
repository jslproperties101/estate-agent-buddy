// PLACEHOLDER: replaced by the Property Rules Quiz builder (Sonnet Medium). Keeps the registry compiling until then.
import type { GameDef } from '../types';
export const game: GameDef = {
  key: 'propertyRules',
  title: { en: 'Property Rules Quiz', bm: 'Kuiz Peraturan Hartanah', zh: '房产规则问答' },
  blurb: { en: 'SPA, loans, stamp duty and more: how well do you know them?', bm: 'SPA, pinjaman, duti setem dan lain-lain.', zh: 'SPA、贷款、印花税等，您了解多少？' },
  icon: () => <svg aria-hidden="true" width={28} height={28} viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="14" height="18" /><rect x="8" y="7" width="8" height="2" fill="#000" /><rect x="8" y="11" width="8" height="2" fill="#000" /><rect x="8" y="15" width="5" height="2" fill="#000" /></svg>,
  Component: ({ onExit }) => <div className="card"><p>Property Rules Quiz</p><button className="btn" onClick={onExit}>OK</button></div>,
};
