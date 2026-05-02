import { MATCHES, TOGGLEABLE_CLUBS, type Match, type Outcome } from '../data';
import {
  bumpScore,
  defaultScore,
  outcomeForClub,
  scoreForClub,
  type Results,
  type Score,
} from '../standings';
import { LOGOS, DISPLAY_NAME } from '../logos';
import { MATCH_PROBABILITIES } from '../odds';
import { useMediaQuery } from '../useMediaQuery';
import { Toggle } from './Toggle';

const MATCHDAYS = [35, 36, 37, 38];

const findMatch = (club: string, md: number): Match | undefined =>
  MATCHES.find((m) => m.matchday === md && (m.home === club || m.away === club));

type Props = {
  results: Results;
  setResult: (id: string, score: Score | null) => void;
};

export function FixturesGrid({ results, setResult }: Props) {
  const isMobile = useMediaQuery('(max-width: 720px)');
  return isMobile
    ? <MobileStack results={results} setResult={setResult} />
    : <DesktopGrid results={results} setResult={setResult} />;
}

function DesktopGrid({ results, setResult }: Props) {
  return (
    <div className="grid">
      <div className="grid-row grid-head">
        <span className="grid-md-label" />
        {TOGGLEABLE_CLUBS.map((c) => (
          <span key={c.key} className="grid-club">
            {LOGOS[c.short] && <img className="grid-club-logo" src={LOGOS[c.short]} alt="" />}
            <span className="grid-club-name">{c.name}</span>
          </span>
        ))}
      </div>

      {MATCHDAYS.map((md) => (
        <div key={md} className="grid-row">
          <span className="grid-md-label">MW{md}</span>
          {TOGGLEABLE_CLUBS.map((c) => {
            const match = findMatch(c.short, md);
            return match ? (
              <FixtureCell
                key={c.key}
                club={c.short}
                match={match}
                score={results[match.id]}
                setResult={setResult}
              />
            ) : (
              <span key={c.key} className="grid-cell empty">—</span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MobileStack({ results, setResult }: Props) {
  return (
    <div className="stack">
      {TOGGLEABLE_CLUBS.map((c) => (
        <section key={c.key} className="stack-club">
          <header className="stack-header">
            {LOGOS[c.short] && <img className="grid-club-logo" src={LOGOS[c.short]} alt="" />}
            <span className="grid-club-name">{c.name}</span>
          </header>
          <div className="stack-body">
            {MATCHDAYS.map((md) => {
              const match = findMatch(c.short, md);
              if (!match) return null;
              return (
                <div key={md} className="stack-item">
                  <span className="stack-md">MW{md}</span>
                  <FixtureCell
                    club={c.short}
                    match={match}
                    score={results[match.id]}
                    setResult={setResult}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

type FixtureCellProps = {
  club: string;
  match: Match;
  score: Score | undefined;
  setResult: (id: string, score: Score | null) => void;
};

const toPct = (p: number) => `${Math.round(p * 100)}%`;

function FixtureCell({ club, match, score, setResult }: FixtureCellProps) {
  const isHome = match.home === club;
  const opp = isHome ? match.away : match.home;
  const outcome = score ? outcomeForClub(match, score, club) : null;
  const display = score ? scoreForClub(match, score, club) : null;
  const probs = MATCH_PROBABILITIES[match.id];
  const winP = probs ? (isHome ? probs.home : probs.away) : 0;
  const lossP = probs ? (isHome ? probs.away : probs.home) : 0;

  const onOutcome = (v: Outcome | null) => {
    setResult(match.id, v == null ? null : defaultScore(match, club, v));
  };

  const onBump = (delta: number) => {
    if (score) setResult(match.id, bumpScore(score, delta));
  };

  const canDecrement =
    !!score &&
    (outcome === 'D' ? score.hg > 0 : Math.max(score.hg, score.ag) > 1);

  return (
    <div className={`grid-cell ${isHome ? 'is-home' : 'is-away'}`}>
      <div className="cell-fixture">
        <span className="cell-venue">{isHome ? 'vs' : '@'}</span>
        {LOGOS[opp] && <img className="opp-logo" src={LOGOS[opp]} alt="" />}
        <span className="cell-opp">{DISPLAY_NAME[opp] ?? opp}</span>
      </div>
      <div className="cell-kickoff">{match.kickoff}</div>
      {probs && (
        <div className="cell-odds">
          <span><span className="odds-label">Win</span> {toPct(winP)}</span>
          <span className="cell-odds-sep">·</span>
          <span><span className="odds-label">Draw</span> {toPct(probs.draw)}</span>
          <span className="cell-odds-sep">·</span>
          <span><span className="odds-label">Loss</span> {toPct(lossP)}</span>
        </div>
      )}
      <Toggle value={outcome} onChange={onOutcome} />
      <div className={`score ${score ? '' : 'disabled'}`}>
        <button
          type="button"
          className="step"
          disabled={!canDecrement}
          onClick={() => onBump(-1)}
        >
          −
        </button>
        <span className="score-text">{display ? `${display[0]}–${display[1]}` : '–'}</span>
        <button
          type="button"
          className="step"
          disabled={!score}
          onClick={() => onBump(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
