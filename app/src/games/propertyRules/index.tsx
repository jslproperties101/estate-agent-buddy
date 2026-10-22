// v1buddychange013: Property Rules Quiz - 10 random multiple-choice questions on Malaysian property practice.
import { useRef, useState } from 'react';
import type { GameDef, GameProps } from '../types';
import { BANK } from './bank';
import { makeRound, isCorrect, correctPosition, ROUND_SIZE } from './logic';
import { PRQ_CSS } from './css';
import { PRQ_TEXT } from './text';

const KEYS = ['A', 'B', 'C', 'D'];

function PropertyRulesQuiz({ lang, onFinish, onExit }: GameProps) {
  const t = PRQ_TEXT[lang];
  const [round] = useState(() => makeRound(Math.floor(Math.random() * 2147483647), BANK, ROUND_SIZE));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const done = useRef(false);
  const total = round.length;
  const cur = round[idx];
  const answered = picked !== null;
  const ok = answered && isCorrect(cur, picked as number);
  const rightPos = correctPosition(cur);

  const choose = (pos: number) => {
    if (answered) return;
    setPicked(pos);
    setResults(r => [...r, isCorrect(cur, pos)]);
  };
  const next = () => {
    if (!answered) return;
    if (idx + 1 >= total) {
      if (done.current) return;
      done.current = true;
      onFinish({ score: results.filter(Boolean).length, maxScore: total });
      return;
    }
    setIdx(idx + 1);
    setPicked(null);
  };

  return (
    <section className="prq" data-testid="prq-root">
      <style>{PRQ_CSS}</style>
      <div className="prq-top">
        <span className="prq-count" data-testid="prq-count">{t.question(idx + 1, total)}</span>
        <button className="btn prq-exit" data-testid="prq-exit" onClick={onExit}>{t.exit}</button>
      </div>
      <div className="prq-bar" role="img" aria-label={t.progress}>
        {round.map((_, i) => {
          const state = i < results.length ? (results[i] ? 'done' : 'bad') : '';
          return <span key={i} className={`prq-seg ${state} ${i === idx ? 'now' : ''}`} />;
        })}
      </div>
      <div className="card prq-card">
        <span className="prq-topic">{t.topic[cur.q.topic]}</span>
        <p className="prq-q" data-testid="prq-question">{cur.q.q[lang]}</p>
        <div className="prq-opts">
          {cur.order.map((orig, pos) => {
            const cls = !answered ? '' : pos === rightPos ? 'right' : pos === picked ? 'wrong' : '';
            return (
              <button key={orig} className={`prq-opt ${cls}`} data-testid={`prq-opt-${pos}`} disabled={answered} onClick={() => choose(pos)}>
                <span className="prq-key" aria-hidden="true">{KEYS[pos]}</span>
                <span>{cur.q.options[orig][lang]}</span>
              </button>
            );
          })}
        </div>
        {answered && (
          <div className={`prq-fb ${ok ? 'right' : 'wrong'}`} data-testid="prq-feedback" role="status">
            <strong>{ok ? t.right : t.wrong}</strong>
            <p>{cur.q.explain[lang]}</p>
          </div>
        )}
        {answered && (
          <button className="btn primary full" data-testid="prq-next" onClick={next}>{idx + 1 >= total ? t.seeResult : t.next}</button>
        )}
      </div>
      <p className="prq-note" data-testid="prq-note">{t.note}</p>
    </section>
  );
}

export const game: GameDef = {
  key: 'propertyRules',
  title: { en: 'Property Rules Quiz', bm: 'Kuiz Peraturan Hartanah', zh: '房产规则问答' },
  blurb: { en: 'SPA, loans, stamp duty and more: how well do you know them?', bm: 'SPA, pinjaman, duti setem dan lain-lain.', zh: 'SPA、贷款、印花税等，您了解多少？' },
  icon: () => <svg aria-hidden="true" width={28} height={28} viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="14" height="18" /><rect x="8" y="7" width="8" height="2" fill="#000" /><rect x="8" y="11" width="8" height="2" fill="#000" /><rect x="8" y="15" width="5" height="2" fill="#000" /></svg>,
  Component: PropertyRulesQuiz,
};
