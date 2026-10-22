// PLACEHOLDER: replaced by the Price It Right builder (Sonnet High). Keeps the registry compiling until then.
import type { GameDef } from '../types';
export const game: GameDef = {
  key: 'priceItRight',
  title: { en: 'Price It Right', bm: 'Teka Harga', zh: '估价达人' },
  blurb: { en: 'Guess the price of real-style Malaysian properties.', bm: 'Teka harga hartanah gaya Malaysia.', zh: '猜一猜马来西亚房产的价格。' },
  icon: () => <svg aria-hidden="true" width={28} height={28} viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="10" width="16" height="10" /><rect x="8" y="5" width="8" height="5" /><rect x="11" y="13" width="2" height="5" fill="#000" /></svg>,
  Component: ({ onExit }) => <div className="card"><p>Price It Right</p><button className="btn" onClick={onExit}>OK</button></div>,
};
