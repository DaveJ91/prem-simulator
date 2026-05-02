import { useMemo, useState } from 'react';
import './App.css';
import {
  computeStandings,
  simulateAll,
  survivalProbabilities,
  type Results,
  type Score,
} from './standings';
import { LeagueTable } from './components/LeagueTable';
import { FixturesGrid } from './components/FixturesGrid';

export default function App() {
  const [results, setResults] = useState<Results>({});

  const standings = useMemo(() => computeStandings(results), [results]);
  const survival = useMemo(() => survivalProbabilities(results), [results]);

  const setResult = (id: string, score: Score | null) =>
    setResults((prev) => {
      const next = { ...prev };
      if (score == null) delete next[id];
      else next[id] = score;
      return next;
    });

  const simulate = () => setResults(simulateAll());
  const reset = () => setResults({});

  return (
    <div className="app">
      <header>
        <div className="header-accent" />
        <div className="header-inner">
          <div className="title-row">
            <img className="header-logo" src="/logos/premier_league.svg" alt="Premier League" />
            <div className="title-stack">
              <span className="eyebrow">Premier League · 2025/26</span>
              <h1>Run-In Simulator</h1>
            </div>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={simulate} type="button">
              <span className="btn-icon" aria-hidden="true">⟳</span>
              Simulate
            </button>
            <button className="btn" onClick={reset} type="button">
              <span className="btn-icon" aria-hidden="true">↺</span>
              Reset
            </button>
          </div>
        </div>
      </header>

      <section className="table-section">
        <LeagueTable standings={standings} survival={survival} />
      </section>

      <section className="grid-section">
        <FixturesGrid results={results} setResult={setResult} />
      </section>
    </div>
  );
}
