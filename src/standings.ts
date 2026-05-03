import { TEAMS, MATCHES, type Match, type Outcome, type TeamSeed } from './data';
import { DRAW_GOALS_DIST, MATCH_PROBABILITIES, WIN_MARGIN_DIST } from './odds';

export type Standing = TeamSeed & { gd: number };

// Goals stored from the home team's perspective.
export type Score = { hg: number; ag: number };
export type Results = Record<string, Score>;

const MAX_GOALS = 5;

export function outcomeForClub(match: Match, score: Score, club: string): Outcome {
  if (score.hg === score.ag) return 'D';
  const homeWon = score.hg > score.ag;
  const isHome = match.home === club;
  return homeWon === isHome ? 'W' : 'L';
}

export function scoreForClub(match: Match, score: Score, club: string): [number, number] {
  return match.home === club ? [score.hg, score.ag] : [score.ag, score.hg];
}

export function defaultScore(match: Match, club: string, outcome: Outcome): Score {
  if (outcome === 'D') return { hg: 0, ag: 0 };
  const isHome = match.home === club;
  const winnerHome = (outcome === 'W') === isHome;
  return winnerHome ? { hg: 1, ag: 0 } : { hg: 0, ag: 1 };
}

// For a draw, both sides move together. For a non-draw, only the winner's goal tally moves
// (clamped so the scoreline never collapses into an upset).
export function bumpScore(score: Score, delta: number): Score {
  if (score.hg === score.ag) {
    const v = Math.max(0, score.hg + delta);
    return { hg: v, ag: v };
  }
  const homeIsWinner = score.hg > score.ag;
  const winnerGoals = homeIsWinner ? score.hg : score.ag;
  const loserGoals = homeIsWinner ? score.ag : score.hg;
  const next = Math.max(loserGoals + 1, Math.min(MAX_GOALS, winnerGoals + delta));
  return homeIsWinner ? { hg: next, ag: score.ag } : { hg: score.hg, ag: next };
}

export function computeStandings(results: Results): Standing[] {
  const map = new Map<string, Standing>();
  for (const t of TEAMS) {
    map.set(t.short, { ...t, gd: t.gf - t.ga });
  }

  for (const m of MATCHES) {
    const r = results[m.id];
    if (!r) continue;
    const home = map.get(m.home);
    const away = map.get(m.away);
    if (!home || !away) continue;

    home.gf += r.hg;
    home.ga += r.ag;
    away.gf += r.ag;
    away.ga += r.hg;
    home.played += 1;
    away.played += 1;

    if (r.hg > r.ag) {
      home.points += 3;
      home.won += 1;
      away.lost += 1;
    } else if (r.hg < r.ag) {
      away.points += 3;
      away.won += 1;
      home.lost += 1;
    } else {
      home.points += 1;
      away.points += 1;
      home.drawn += 1;
      away.drawn += 1;
    }
    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;
  }

  const all = [...map.values()];
  all.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
  });
  return all;
}

// Knuth's Poisson sampler.
function poisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

const LEAGUE_AVG = 1.35; // typical PL goals per team per game
const HOME_BOOST = 1.1;
const AWAY_BOOST = 0.9;

function lambdaFor(attackTeam: TeamSeed, defenceTeam: TeamSeed, isHome: boolean): number {
  const attackRate = attackTeam.gf / Math.max(1, attackTeam.played);
  const concedeRate = defenceTeam.ga / Math.max(1, defenceTeam.played);
  const boost = isHome ? HOME_BOOST : AWAY_BOOST;
  const lambda = (attackRate * concedeRate) / LEAGUE_AVG * boost;
  // Clamp to reasonable bounds to avoid degenerate cases.
  return Math.max(0.2, Math.min(3.5, lambda));
}

export function simulateAll(): Results {
  const teamMap = new Map(TEAMS.map((t) => [t.short, t]));
  const out: Results = {};
  for (const m of MATCHES) {
    const home = teamMap.get(m.home);
    const away = teamMap.get(m.away);
    if (!home || !away) continue;
    const lambdaHome = lambdaFor(home, away, true);
    const lambdaAway = lambdaFor(away, home, false);
    out[m.id] = {
      hg: Math.min(MAX_GOALS, poisson(lambdaHome)),
      ag: Math.min(MAX_GOALS, poisson(lambdaAway)),
    };
  }
  return out;
}

// Mulberry32: tiny seeded PRNG. Used so survival % is deterministic for a given input.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleFromDist(dist: number[], rand: () => number): number {
  const r = rand();
  let acc = 0;
  for (let i = 0; i < dist.length; i++) {
    acc += dist[i];
    if (r < acc) return i + 1;
  }
  return dist.length;
}

function sampleScore(matchId: string, rand: () => number): Score | null {
  const probs = MATCH_PROBABILITIES[matchId];
  if (!probs) return null;
  const r = rand();
  if (r < probs.home) {
    const margin = sampleFromDist(WIN_MARGIN_DIST, rand);
    return { hg: margin, ag: 0 };
  }
  if (r < probs.home + probs.draw) {
    const goals = sampleFromDist(DRAW_GOALS_DIST, rand) - 1;
    return { hg: goals, ag: goals };
  }
  const margin = sampleFromDist(WIN_MARGIN_DIST, rand);
  return { hg: 0, ag: margin };
}

// Monte Carlo: estimate each team's chance of finishing 17th or better.
//
// Uses a fixed seed so the same 10k sampled "futures" are reused across every
// call. This guarantees monotonicity in the locked inputs — bumping a Spurs
// 3-0 win to 4-0 can only improve their position (better GD, same points), so
// their survival % must move up or stay flat. With a per-input hash, the RNG
// sequence used to sample the OTHER 11 fixtures would also change, and the
// resulting variance (~1-2pp) easily swamped the small genuine GD signal —
// users saw their survival drop after entering a more favourable result.
const SURVIVAL_SEED = 0x9e3779b9;

export function survivalProbabilities(
  locked: Results,
  iterations = 10000,
): Record<string, number> {
  const rand = mulberry32(SURVIVAL_SEED);
  const counts: Record<string, number> = {};
  for (const t of TEAMS) counts[t.short] = 0;

  for (let i = 0; i < iterations; i++) {
    // Always sample every fixture in fixed order so the RNG sequence consumed
    // per iteration is identical regardless of which fixtures are locked.
    // Then overlay the locked results, which take precedence.
    const sim: Results = {};
    for (const m of MATCHES) {
      const s = sampleScore(m.id, rand);
      if (s) sim[m.id] = s;
    }
    Object.assign(sim, locked);

    const standings = computeStandings(sim);
    const safeCount = Math.min(17, standings.length);
    for (let pos = 0; pos < safeCount; pos++) counts[standings[pos].short] += 1;
  }

  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / iterations]));
}
