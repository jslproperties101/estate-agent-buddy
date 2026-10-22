// v1buddychange013: the Games list (opened from the Games tile on Home) and the frame every game runs in.
import { useState } from 'react';
import type { Lang } from '../i18n';
import type { Go } from '../nav';
import { GAMES, gameByKey } from './registry';
import { gameStrings } from './strings';
import { loadGames, saveGames, recordResult, liveStreak, type GamesState } from './scores';
import type { GameResult } from './types';

export function GamesHub({ lang, go }: { lang: Lang; go: Go }) {
  const t = gameStrings[lang];
  const [s] = useState<GamesState>(() => loadGames());
  const streak = liveStreak(s, Date.now());
  return (
    <section className="stack games-hub" data-testid="games-hub">
      <div className="card games-streak" data-testid="games-streak">
        <strong>{streak > 0 ? t.streak(streak) : t.noStreak}</strong>
        {s.badges.length > 0 && (
          <div className="games-badges" aria-label={t.badgesTitle}>
            {s.badges.map(b => <span key={b} className="badge games-badge">{t.badge[b as keyof typeof t.badge] ?? b}</span>)}
          </div>
        )}
      </div>
      {GAMES.map(g => {
        const st = s.games[g.key];
        return (
          <button key={g.key} className="card link-card games-card" data-testid={`game-${g.key}`} onClick={() => go({ name: 'game', key: g.key })}>
            <span className="games-icon">{g.icon()}</span>
            <span className="games-text">
              <strong>{g.title[lang]}</strong>
              <small className="muted">{g.blurb[lang]}</small>
              <small className="games-best">{st ? `${t.best(st.best, st.bestMax)} · ${t.plays(st.plays)}` : t.notPlayed}</small>
            </span>
          </button>
        );
      })}
      <p className="muted small">{t.note}</p>
    </section>
  );
}

export function GameFrame({ lang, gameKey, back }: { lang: Lang; gameKey: string; back: () => void }) {
  const t = gameStrings[lang];
  const g = gameByKey(gameKey);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<{ r: GameResult; best: boolean } | null>(null);
  if (!g) return <section className="card"><p>{t.notPlayed}</p><button className="btn" onClick={back}>{t.backToGames}</button></section>;
  const finish = (r: GameResult) => {
    const before = loadGames();
    const old = before.games[g.key];
    const next = recordResult(before, g.key, r, Date.now());
    saveGames(next);
    const now = next.games[g.key]!;
    setResult({ r, best: !old || (now.best !== old.best || now.bestMax !== old.bestMax) });
  };
  const C = g.Component;
  return (
    <section className="stack game-frame" data-testid={`game-frame-${g.key}`}>
      {!result && <C key={round} lang={lang} onFinish={finish} onExit={back} />}
      {result && (
        <div className="card stack-sm games-result" data-testid="game-result">
          <h2>{t.resultTitle}</h2>
          <p data-testid="game-result-score">{t.resultScore(Math.round(result.r.score), Math.round(result.r.maxScore))}</p>
          {result.best && <p className="games-newbest">{t.newBest}</p>}
          <button className="btn primary full" data-testid="game-again" onClick={() => { setResult(null); setRound(n => n + 1); }}>{t.again}</button>
          <button className="btn full" data-testid="game-back" onClick={back}>{t.backToGames}</button>
        </div>
      )}
    </section>
  );
}
