// v1buddychange015 (Batch I): Match the Buyer. A buyer brief (budget, two areas, type, bedrooms) and a stack of practice
// listings: swipe right (Match) when a listing fits every need, left (Skip) when any need is missed. 60-second round;
// right answers score 100 + 20 per answer already in the streak; a wrong answer costs 5 seconds. New buyer every 6 cards.
import { useEffect, useRef, useState } from 'react';
import type { GameDef, GameProps } from '../types';
import type { Lang } from '../../i18n';
import { newBuyer, newListing, misses, rm, type Buyer, type MatchListing, type Miss, type PType } from '../sample';
import { mbStrings } from './strings';

export const ROUND_SECONDS = 60;
export const MAX_SCORE = 4000;
export const CARDS_PER_BUYER = 6;
export const pointsFor = (streakBefore: number) => 100 + 20 * streakBefore;

const CSS = `
.mb-root { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.mb-hud { display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap; }
.mb-chip { background: #17130d; border: 1px solid rgba(217,169,63,.55); border-radius: 10px; padding: 4px 12px; display: flex; flex-direction: column; min-width: 64px; }
.mb-chip small { font-size: 14px; color: #c4b48f; line-height: 1.2; }
.mb-chip b { font-size: 24px; line-height: 1.1; color: #f3cf74; font-variant-numeric: tabular-nums; }
.mb-chip.mb-low b { color: #ec8a6f; }
.mb-hud .btn { margin-left: auto; min-height: 44px; }
.mb-brief { background: #211b12; border: 1px solid #d9a93f; border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; transition: box-shadow .3s; }
.mb-brief.mb-flash { box-shadow: 0 0 0 4px rgba(243,207,116,.35); }
.mb-brief-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.mb-brief-head small { font-size: 14px; color: #c4b48f; }
.mb-brief-head b { font-size: 22px; color: #f3cf74; }
.mb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin: 0; }
.mb-grid div { min-width: 0; }
.mb-grid dt { font-size: 14px; color: #c4b48f; }
.mb-grid dd { margin: 1px 0 0; font-weight: 700; font-size: 15px; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.mb-deck { position: relative; height: clamp(230px, 36vh, 380px); }
.mb-card { position: absolute; inset: 0; background: #17130d; border: 1px solid rgba(217,169,63,.55); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column;
  touch-action: none; cursor: grab; box-shadow: 0 18px 40px rgba(0,0,0,.45); user-select: none; -webkit-user-select: none; }
.mb-card.mb-behind { transform: scale(.95) translateY(10px); opacity: .5; pointer-events: none; }
.mb-card.mb-fly { transition: transform .32s ease-in, opacity .32s ease-in; }
.mb-card.mb-back { transition: transform .25s ease-out; }
.mb-pic { flex: 1; min-height: 90px; background: linear-gradient(180deg, #2c2114, #120f0a); display: grid; place-items: center; position: relative; }
.mb-pic svg { width: 72%; max-width: 260px; height: auto; max-height: 90%; }
.mb-tag { position: absolute; top: 10px; left: 12px; font-size: 14px; color: #c4b48f; font-variant-numeric: tabular-nums; }
.mb-stamp { position: absolute; top: 16px; padding: 2px 12px; border: 3px solid; border-radius: 8px; font-weight: 800; font-size: 24px; text-transform: uppercase; opacity: 0; }
.mb-stamp.mb-yes { right: 14px; color: #7fd49b; border-color: #7fd49b; transform: rotate(10deg); }
.mb-stamp.mb-no { left: 14px; color: #ec8a6f; border-color: #ec8a6f; transform: rotate(-10deg); }
.mb-info { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 8px; }
.mb-price { font-weight: 800; font-size: 28px; line-height: 1.1; color: #f3cf74; font-variant-numeric: tabular-nums; }
.mb-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; }
.mb-facts div { min-width: 0; }
.mb-facts dt { font-size: 14px; color: #c4b48f; }
.mb-facts dd { margin: 1px 0 0; font-weight: 700; font-size: 15px; overflow-wrap: anywhere; }
.mb-fb { min-height: 22px; margin: 0; text-align: center; font-weight: 700; font-size: 15px; }
.mb-fb.mb-good { color: #7fd49b; }
.mb-fb.mb-bad { color: #ec8a6f; }
.mb-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mb-acts .btn { min-height: 56px; font-size: 20px; font-weight: 800; }
.mb-skip { border-color: #ec8a6f !important; color: #ec8a6f !important; background: transparent !important; }
.mb-intro { display: flex; flex-direction: column; gap: 12px; }
.mb-intro ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 15px; line-height: 1.4; }
@media (prefers-reduced-motion: reduce) { .mb-card.mb-fly, .mb-card.mb-back, .mb-brief { transition: none; } }
`;

/* Simple line drawings of each property type (fixed shapes, no user text inside). */
const G1 = '#f3cf74', G2 = '#d9a93f';
function picture(type: PType['id'], seed: number): string {
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const win = (x: number, y: number) => `<rect x="${x}" y="${y}" width="8" height="8" fill="${rnd() < 0.55 ? G1 : '#2a2219'}"/>`;
  let s = `<svg viewBox="0 0 200 140" aria-hidden="true"><line x1="0" y1="132" x2="200" y2="132" stroke="${G2}" stroke-width="2"/>`;
  if (type === 'condo') {
    s += `<rect x="64" y="10" width="72" height="122" fill="#1c1610" stroke="${G2}" stroke-width="2"/>`;
    for (let y = 20; y < 124; y += 13) for (let x = 72; x < 130; x += 15) s += win(x, y);
    s += `<rect x="30" y="60" width="30" height="72" fill="#1c1610" stroke="${G2}" stroke-width="2"/>`;
    for (let y = 68; y < 126; y += 13) s += win(41, y);
  } else if (type === 'terrace') {
    for (let i = 0; i < 3; i++) { const x = 22 + i * 54; s += `<rect x="${x}" y="62" width="52" height="70" fill="#1c1610" stroke="${G2}" stroke-width="2"/><path d="M${x - 4} 64 L${x + 26} 36 L${x + 56} 64" fill="none" stroke="${G1}" stroke-width="2"/>${win(x + 10, 74)}${win(x + 34, 74)}<rect x="${x + 20}" y="106" width="12" height="26" fill="${G2}"/>`; }
  } else if (type === 'town') {
    for (let i = 0; i < 2; i++) { const x = 40 + i * 62; s += `<rect x="${x}" y="40" width="58" height="92" fill="#1c1610" stroke="${G2}" stroke-width="2"/><line x1="${x}" y1="86" x2="${x + 58}" y2="86" stroke="${G2}" stroke-width="2"/>${win(x + 12, 54)}${win(x + 38, 54)}${win(x + 12, 98)}<rect x="${x + 36}" y="106" width="12" height="26" fill="${G2}"/>`; }
  } else if (type === 'semid') {
    s += `<rect x="30" y="58" width="140" height="74" fill="#1c1610" stroke="${G2}" stroke-width="2"/><line x1="100" y1="58" x2="100" y2="132" stroke="${G2}" stroke-width="2"/><path d="M24 60 L64 26 L100 50 L136 26 L176 60" fill="none" stroke="${G1}" stroke-width="2"/>`;
    s += `${win(46, 72)}${win(72, 72)}${win(120, 72)}${win(146, 72)}<rect x="58" y="104" width="12" height="28" fill="${G2}"/><rect x="130" y="104" width="12" height="28" fill="${G2}"/>`;
  } else {
    s += `<rect x="18" y="66" width="164" height="66" fill="#1c1610" stroke="${G2}" stroke-width="2"/><path d="M10 68 L100 22 L190 68" fill="none" stroke="${G1}" stroke-width="2"/><rect x="132" y="88" width="40" height="44" fill="none" stroke="${G2}" stroke-width="2"/>`;
    for (let x = 32; x < 120; x += 20) s += win(x, 80);
    s += `<rect x="64" y="104" width="14" height="28" fill="${G2}"/><circle cx="186" cy="110" r="10" fill="#2f4a28"/><rect x="185" y="118" width="2" height="14" fill="#3b2a1a"/>`;
  }
  return `${s}</svg>`;
}

export function missText(lang: Lang, m: Miss): string {
  const t = mbStrings[lang];
  switch (m.k) {
    case 'price': return t.overBy(rm(m.over));
    case 'area': return t.wrongArea(m.area);
    case 'type': return t.wrongType(m.type.n[lang]);
    case 'beds': return t.fewBeds(m.beds);
  }
}

function Card({ L, lang, behind, cardRef, handlers }: { L: MatchListing; lang: Lang; behind?: boolean; cardRef?: { current: HTMLDivElement | null }; handlers?: Record<string, unknown> }) {
  const t = mbStrings[lang];
  return (
    <div className={`mb-card${behind ? ' mb-behind' : ''}`} ref={cardRef} data-testid={behind ? 'mb-next' : 'mb-card'} {...(handlers ?? {})}>
      <div className="mb-pic">
        <span className="mb-tag">{t.listing} #{L.no}</span>
        <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: picture(L.type.id, L.seed) }} />
        <span className="mb-stamp mb-yes">{t.match}</span><span className="mb-stamp mb-no">{t.skip}</span>
      </div>
      <div className="mb-info">
        <div className="mb-price" data-testid={behind ? undefined : 'mb-price'}>{rm(L.price)}</div>
        <dl className="mb-facts">
          <div><dt>{t.area}</dt><dd data-testid={behind ? undefined : 'mb-area'}>{L.area}</dd></div>
          <div><dt>{t.type}</dt><dd>{L.type.n[lang]}</dd></div>
          <div><dt>{t.beds}</dt><dd>{L.beds}</dd></div>
        </dl>
      </div>
    </div>
  );
}

interface PlayState { buyer: Buyer; count: number; cur: MatchListing; next: MatchListing; score: number; streak: number; correct: number; seen: number; fb: string; fbCls: string; flash: boolean }

function Play({ lang, onFinish, onExit }: GameProps) {
  const t = mbStrings[lang];
  const S = useRef<PlayState | null>(null);
  if (!S.current) { const b = newBuyer(Math.random); S.current = { buyer: b, count: 0, cur: newListing(Math.random, b), next: newListing(Math.random, b), score: 0, streak: 0, correct: 0, seen: 0, fb: '', fbCls: '', flash: false }; }
  const [, setTick] = useState(0);
  const redraw = () => setTick(n => n + 1);
  const endAt = useRef(Date.now() + ROUND_SECONDS * 1000);
  const [left, setLeft] = useState(ROUND_SECONDS);
  const busy = useRef(false), done = useRef(false);
  const card = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; dx: number } | null>(null);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onFinish({ score: Math.min(MAX_SCORE, S.current!.score), maxScore: MAX_SCORE });
  };
  useEffect(() => {
    const id = window.setInterval(() => {
      const l = Math.max(0, (endAt.current - Date.now()) / 1000);
      setLeft(l);
      if (l <= 0) { window.clearInterval(id); finish(); }
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const decide = (saysMatch: boolean) => {
    const s = S.current!;
    if (busy.current || done.current) return;
    busy.current = true;
    const why = misses(s.buyer, s.cur), fits = why.length === 0, right = saysMatch === fits;
    if (right) {
      const pts = pointsFor(s.streak); s.streak++; s.correct++; s.score += pts;
      s.fb = `${t.good} +${pts} · ${fits ? t.fits : missText(lang, why[0])}`; s.fbCls = 'mb-good';
    } else {
      s.streak = 0; endAt.current -= 5000;
      s.fb = `−5s · ${fits ? t.missed : missText(lang, why[0])}`; s.fbCls = 'mb-bad';
    }
    const el = card.current;
    if (el) { el.classList.add('mb-fly'); el.style.transform = `translateX(${(saysMatch ? 1 : -1) * window.innerWidth * 1.2}px) rotate(${saysMatch ? 18 : -18}deg)`; el.style.opacity = '0'; }
    redraw();
    window.setTimeout(() => {
      s.seen++; s.count++;
      if (s.count >= CARDS_PER_BUYER) {
        s.buyer = newBuyer(Math.random, s.buyer.name); s.count = 0; s.cur = newListing(Math.random, s.buyer);
        s.fb = t.newBuyer(s.buyer.name); s.fbCls = ''; s.flash = true;
        window.setTimeout(() => { s.flash = false; redraw(); }, 600);
      } else s.cur = s.next;
      s.next = newListing(Math.random, s.buyer);
      const c = card.current; if (c) { c.classList.remove('mb-fly'); c.style.transform = ''; c.style.opacity = ''; c.querySelectorAll<HTMLElement>('.mb-stamp').forEach(x => { x.style.opacity = '0'; }); }
      busy.current = false; redraw();
    }, right ? 260 : 520);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') { e.preventDefault(); decide(true); } else if (e.key === 'ArrowLeft') { e.preventDefault(); decide(false); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const stamps = (dx: number) => {
    const el = card.current; if (!el) return;
    const y = el.querySelector<HTMLElement>('.mb-yes'), n = el.querySelector<HTMLElement>('.mb-no');
    if (y) y.style.opacity = String(Math.max(0, Math.min(1, dx / 90)));
    if (n) n.style.opacity = String(Math.max(0, Math.min(1, -dx / 90)));
  };
  const handlers = {
    onPointerDown: (e: PointerEvent) => {
      if (busy.current) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0 };
      card.current?.classList.remove('mb-back');
      try { card.current?.setPointerCapture(e.pointerId); } catch { /* old WebView */ }
    },
    onPointerMove: (e: PointerEvent) => {
      const d = drag.current; if (!d || d.id !== e.pointerId || !card.current) return;
      d.dx = e.clientX - d.x;
      card.current.style.transform = `translate(${d.dx}px, ${(e.clientY - d.y) * 0.2}px) rotate(${d.dx / 18}deg)`;
      stamps(d.dx);
    },
    onPointerUp: (e: PointerEvent) => {
      const d = drag.current; if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      if (Math.abs(d.dx) > 90) decide(d.dx > 0);
      else if (card.current) { card.current.classList.add('mb-back'); card.current.style.transform = ''; stamps(0); }
    },
    onPointerCancel: () => { drag.current = null; if (card.current) { card.current.style.transform = ''; stamps(0); } },
  };

  const s = S.current!;
  const b = s.buyer;
  return (
    <div className="mb-root" data-testid="mb-root">
      <style>{CSS}</style>
      <div className="mb-hud">
        <div className={`mb-chip${left < 10 ? ' mb-low' : ''}`}><small>{t.time}</small><b data-testid="mb-time">{Math.ceil(left)}</b></div>
        <div className="mb-chip"><small>{t.score}</small><b data-testid="mb-score">{s.score}</b></div>
        <div className="mb-chip"><small>{t.streak}</small><b data-testid="mb-streak">{s.streak}</b></div>
        <button className="btn secondary" data-testid="mb-finish" onClick={finish}>{t.finish}</button>
      </div>
      <section className={`mb-brief${s.flash ? ' mb-flash' : ''}`} data-testid="mb-brief" aria-live="polite">
        <div className="mb-brief-head"><small>{t.brief}</small><b data-testid="mb-buyer">{b.name}</b></div>
        <dl className="mb-grid">
          <div><dt>{t.budget}</dt><dd data-testid="mb-budget">{t.upTo(rm(b.budget))}</dd></div>
          <div><dt>{t.areas}</dt><dd>{b.areas.join(` ${t.or} `)}</dd></div>
          <div><dt>{t.type}</dt><dd>{b.type ? b.type.n[lang] : t.any}</dd></div>
          <div><dt>{t.beds}</dt><dd>{t.min(b.minBeds)}</dd></div>
        </dl>
      </section>
      <div className="mb-deck">
        <Card key={`n${s.seen}`} L={s.next} lang={lang} behind />
        <Card key={`c${s.seen}`} L={s.cur} lang={lang} cardRef={card} handlers={handlers} />
      </div>
      <p className={`mb-fb ${s.fbCls}`} data-testid="mb-feedback" aria-live="polite">{s.fb}</p>
      <div className="mb-acts">
        <button className="btn mb-skip" data-testid="mb-skip" onClick={() => decide(false)}>{t.skip}</button>
        <button className="btn primary" data-testid="mb-match" onClick={() => decide(true)}>{t.match}</button>
      </div>
      <button className="btn ghost" data-testid="mb-exit" onClick={onExit}>{t.back}</button>
    </div>
  );
}

function MatchBuyer(p: GameProps) {
  const t = mbStrings[p.lang];
  const [play, setPlay] = useState(false);
  if (play) return <Play {...p} />;
  return (
    <div className="card mb-intro" data-testid="mb-intro">
      <h2>{t.title}</h2>
      <p>{t.intro}</p>
      <ol><li>{t.how1}</li><li>{t.how2}</li><li>{t.how3}</li></ol>
      <p className="muted small">{t.sample}</p>
      <button className="btn primary full" data-testid="mb-start" onClick={() => setPlay(true)}>{t.start}</button>
      <button className="btn full" data-testid="mb-back" onClick={p.onExit}>{t.back}</button>
    </div>
  );
}

export const game: GameDef = {
  key: 'matchBuyer',
  title: { en: mbStrings.en.title, bm: mbStrings.bm.title, zh: mbStrings.zh.title },
  blurb: { en: mbStrings.en.blurb, bm: mbStrings.bm.blurb, zh: mbStrings.zh.blurb },
  icon: () => <svg aria-hidden="true" width={28} height={28} viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="11" height="15" rx="1" opacity=".55" /><rect x="8" y="6" width="12" height="15" rx="1" /><rect x="11" y="13" width="2" height="2" fill="#0E0E10" /><rect x="13" y="15" width="2" height="2" fill="#0E0E10" /><rect x="15" y="11" width="2" height="4" fill="#0E0E10" /></svg>,
  Component: MatchBuyer,
};
