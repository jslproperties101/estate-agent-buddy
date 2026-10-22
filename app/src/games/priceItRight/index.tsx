// Price It Right (v1buddychange013): a quick property pricing quiz. Eight questions, four price options each, one point per
// right answer. Two modes: built-in Malaysian practice scenarios, and questions built from the agent's own saved listings.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameDef, GameProps } from '../types';
import { useApp } from '../../data/useStore';
import { visible } from '../../team/access';
import { rm } from '../../lib/money';
import { listingStrings, typeLabel } from '../../listing/strings';
import type { Lang } from '../../i18n';
import { BANK } from './bank';
import { MIN_MINE, ROUND_SIZE, buildBankRound, buildMineRound, mulberry32, newSeed, priceableListings, type Question } from './logic';
import { PixelArt } from './art';
import { PIR_CSS } from './css';
import { pirStrings, type PirStrings } from './strings';

const LETTERS = ['A', 'B', 'C', 'D'];
const num = (n: number) => Math.round(n).toLocaleString('en-US');
const priceText = (q: Question, n: number, t: PirStrings) => `${rm(n)}${q.kind === 'rent' ? t.perMonth : ''}`;

function PropertyCard({ q, t, lang }: { q: Question; t: PirStrings; lang: Lang }) {
  const c = q.card;
  const type = c.typeKey ? t.types[c.typeKey] : typeLabel(listingStrings[lang], c.typeText);
  const state = c.stateKey ? t.states[c.stateKey] : c.stateText;
  const place = [c.area, state].filter(Boolean).join(' · ');
  return (
    <div className="pir-card" data-testid="pir-card">
      <div className="pir-art"><PixelArt art={c.art} /></div>
      <div className="pir-head">
        {type && <strong className="pir-type">{type}</strong>}
        {place && <span className="pir-area">{place}</span>}
      </div>
      <ul className="pir-spec">
        <li className={`kind ${q.kind === 'sale' ? 'sale-tag' : ''}`}>{q.kind === 'sale' ? t.forSale : t.forRent}</li>
        {c.tenure && <li>{c.tenure === 'freehold' ? t.freehold : t.leasehold}</li>}
        {c.floors ? <li>{t.storeys(c.floors)}</li> : null}
        {c.beds ? <li>{t.beds(c.beds)}</li> : null}
        {c.baths ? <li>{t.baths(c.baths)}</li> : null}
        {c.builtUp ? <li>{t.builtUp(num(c.builtUp))}</li> : null}
        {c.land ? <li>{t.land(num(c.land))}</li> : null}
      </ul>
      {c.note && <p className="pir-flavour">{c.note[lang]}</p>}
    </div>
  );
}

function PriceItRight({ lang, onFinish, onExit }: GameProps) {
  const { state } = useApp();
  const t = pirStrings[lang];
  const mine = useMemo(() => visible(state, 'properties', state.properties), [state]);
  const mineCount = useMemo(() => priceableListings(mine).length, [mine]);
  const mineOk = mineCount >= MIN_MINE;

  const [qs, setQs] = useState<Question[] | null>(null);
  const [mode, setMode] = useState<'bank' | 'mine'>('bank');
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const finished = useRef(false);   // onFinish is called once, even on a double tap
  const root = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);

  const begin = (m: 'bank' | 'mine') => {
    if (m === 'mine' && !mineOk) return;
    const rng = mulberry32(newSeed());
    setMode(m); setI(0); setPicked(null); setScore(0); finished.current = false;
    setQs(m === 'bank' ? buildBankRound(rng, BANK, ROUND_SIZE) : buildMineRound(rng, mine, ROUND_SIZE));
  };

  useEffect(() => { root.current?.scrollIntoView?.({ block: 'start' }); }, [i, qs]);
  useEffect(() => { if (picked !== null) actions.current?.scrollIntoView?.({ block: 'nearest' }); }, [picked]);

  const answer = (k: number) => {
    if (!qs || picked !== null) return;
    setPicked(k);
    if (k === qs[i].correctIndex) setScore(s => s + 1);
  };
  const next = () => {
    if (!qs || picked === null) return;
    if (i + 1 < qs.length) { setI(i + 1); setPicked(null); return; }
    if (finished.current) return;
    finished.current = true;
    onFinish({ score, maxScore: qs.length });
  };

  // ---------- mode choice ----------
  if (!qs) {
    return (
      <div className="pir" ref={root} data-testid="pir-root">
        <style>{PIR_CSS}</style>
        <div className="card stack-sm pir-menu" data-testid="pir-menu">
          <h2 className="pir-title pir-mono">{t.name}</h2>
          <div className="pir-disc" data-testid="pir-disclaimer">{t.disclaimer}</div>
          <p className="pir-note">{t.intro(ROUND_SIZE)}</p>
          <button type="button" className="btn pir-mode" data-testid="pir-mode-bank" onClick={() => begin('bank')}>
            <strong className="pir-mono">{t.modeBuiltIn}</strong>
            <small>{t.modeBuiltInHint}</small>
          </button>
          <button type="button" className="btn pir-mode" data-testid="pir-mode-mine" aria-disabled={!mineOk} aria-describedby={mineOk ? undefined : 'pir-mine-why'} onClick={() => begin('mine')}>
            <strong className="pir-mono">{t.modeMine}</strong>
            <small>{t.modeMineHint}</small>
            {!mineOk && <small id="pir-mine-why" className="pir-why" data-testid="pir-mine-locked">{t.mineLocked(mineCount, MIN_MINE)}</small>}
          </button>
          <button type="button" className="btn secondary full" data-testid="pir-exit" onClick={onExit}>{t.exit}</button>
        </div>
      </div>
    );
  }

  // ---------- a question ----------
  const q = qs[i];
  const done = picked !== null;
  const right = done && picked === q.correctIndex;
  return (
    <div className="pir" ref={root} data-testid="pir-root">
      <style>{PIR_CSS}</style>
      <div className="card stack-sm">
        <div className="pir-top">
          <div className="pir-top-info pir-mono">
            <span data-testid="pir-progress-text">{t.questionOf(i + 1, qs.length)}</span>
            <span data-testid="pir-score">{t.scoreNow(score)}</span>
          </div>
          <button type="button" className="btn small secondary" data-testid="pir-exit" onClick={onExit}>{t.exit}</button>
        </div>
        <div className="pir-prog" aria-hidden="true" data-testid="pir-progress">
          {qs.map((x, k) => <i key={x.id} className={k < i ? 'done' : k === i ? 'cur' : ''} />)}
        </div>
        <div className="pir-disc" data-testid="pir-disclaimer">{mode === 'mine' ? t.mineNote : t.disclaimer}</div>
        <PropertyCard q={q} t={t} lang={lang} />
        <h3 className="pir-q pir-mono" data-testid="pir-question">{q.kind === 'sale' ? t.askSale : t.askRent}</h3>
        <div className="pir-opts" role="group" aria-label={q.kind === 'sale' ? t.askSale : t.askRent}>
          {q.options.map((n, k) => {
            const isRight = done && k === q.correctIndex;
            const isWrong = done && k === picked && k !== q.correctIndex;
            return (
              <button key={k} type="button" data-testid={`pir-opt-${k}`} aria-disabled={done}
                data-state={isRight ? 'right' : isWrong ? 'wrong' : done ? 'other' : 'open'}
                className={`btn pir-opt ${isRight ? 'is-right' : isWrong ? 'is-wrong' : done ? 'is-dim' : ''}`} onClick={() => answer(k)}>
                <span className="pir-letter pir-mono" aria-hidden="true">{LETTERS[k]}</span>
                <span className="pir-amt">{priceText(q, n, t)}</span>
                {isRight && <span className="pir-tag">{'✓ '}{t.rightTag}</span>}
                {isWrong && <span className="pir-tag">{'✗ '}{t.yourPick}</span>}
              </button>
            );
          })}
        </div>
        {done && (
          <div className={`pir-fb ${right ? 'ok' : 'no'}`} role="status" aria-live="polite" data-testid="pir-feedback" data-result={right ? 'correct' : 'wrong'}>
            <strong className="pir-mono">{right ? t.right : t.wrong}</strong>
            <span data-testid="pir-answer">{t.theAnswer(priceText(q, q.price, t))}</span>
          </div>
        )}
        {done && (
          <div className="pir-actions" ref={actions}>
            <button type="button" className="btn primary full" data-testid="pir-next" onClick={next}>{i + 1 < qs.length ? t.next : t.seeResult}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export const game: GameDef = {
  key: 'priceItRight',
  title: { en: 'Price It Right', bm: 'Teka Harga', zh: '估价达人' },
  blurb: { en: 'Guess the price of real-style Malaysian properties.', bm: 'Teka harga hartanah gaya Malaysia.', zh: '猜一猜马来西亚房产的价格。' },
  icon: () => (
    <svg aria-hidden="true" width={28} height={28} viewBox="0 0 24 24" fill="currentColor" shapeRendering="crispEdges">
      <rect x="4" y="11" width="16" height="9" /><rect x="8" y="7" width="8" height="4" /><rect x="10" y="3" width="4" height="4" />
      <rect x="9" y="14" width="2" height="2" fill="#000" /><rect x="13" y="14" width="2" height="2" fill="#000" /><rect x="11" y="17" width="2" height="3" fill="#000" />
    </svg>
  ),
  Component: PriceItRight,
};
