import { describe, expect, it } from 'vitest';
import { MATCHES, TEAMS, type Match } from './data';
import {
  bumpScore,
  computeStandings,
  defaultScore,
  outcomeForClub,
  scoreForClub,
  simulateAll,
  survivalProbabilities,
  type Results,
  type Score,
} from './standings';

// --- Helpers ---------------------------------------------------------------

const findMatch = (id: string): Match => {
  const m = MATCHES.find((x) => x.id === id);
  if (!m) throw new Error(`No fixture for ${id}`);
  return m;
};

// --- outcomeForClub --------------------------------------------------------

describe('outcomeForClub', () => {
  // M35-AVL-TOT: AVL home, TOT away.
  const m = findMatch('M35-AVL-TOT');

  it('classifies a home win as W for the home club', () => {
    expect(outcomeForClub(m, { hg: 2, ag: 1 }, 'AVL')).toBe('W');
  });

  it('classifies a home win as L for the away club', () => {
    expect(outcomeForClub(m, { hg: 2, ag: 1 }, 'TOT')).toBe('L');
  });

  it('classifies an away win as L for the home club', () => {
    expect(outcomeForClub(m, { hg: 0, ag: 3 }, 'AVL')).toBe('L');
  });

  it('classifies an away win as W for the away club', () => {
    expect(outcomeForClub(m, { hg: 0, ag: 3 }, 'TOT')).toBe('W');
  });

  it('classifies equal scores as D regardless of perspective', () => {
    expect(outcomeForClub(m, { hg: 1, ag: 1 }, 'AVL')).toBe('D');
    expect(outcomeForClub(m, { hg: 1, ag: 1 }, 'TOT')).toBe('D');
    expect(outcomeForClub(m, { hg: 0, ag: 0 }, 'AVL')).toBe('D');
  });
});

// --- scoreForClub ----------------------------------------------------------

describe('scoreForClub', () => {
  const m = findMatch('M35-AVL-TOT');

  it('returns goals as [home, away] for the home club', () => {
    expect(scoreForClub(m, { hg: 2, ag: 1 }, 'AVL')).toEqual([2, 1]);
  });

  it('flips goals to [away, home] for the away club', () => {
    expect(scoreForClub(m, { hg: 2, ag: 1 }, 'TOT')).toEqual([1, 2]);
  });
});

// --- defaultScore ----------------------------------------------------------

describe('defaultScore', () => {
  const m = findMatch('M35-AVL-TOT'); // AVL home, TOT away

  it('returns 0-0 for any draw', () => {
    expect(defaultScore(m, 'AVL', 'D')).toEqual({ hg: 0, ag: 0 });
    expect(defaultScore(m, 'TOT', 'D')).toEqual({ hg: 0, ag: 0 });
  });

  it('returns 1-0 when the home club wins', () => {
    expect(defaultScore(m, 'AVL', 'W')).toEqual({ hg: 1, ag: 0 });
  });

  it('returns 0-1 when the away club wins (away club perspective W)', () => {
    expect(defaultScore(m, 'TOT', 'W')).toEqual({ hg: 0, ag: 1 });
  });

  it('returns 0-1 when the home club loses', () => {
    expect(defaultScore(m, 'AVL', 'L')).toEqual({ hg: 0, ag: 1 });
  });

  it('returns 1-0 when the away club loses (home wins)', () => {
    expect(defaultScore(m, 'TOT', 'L')).toEqual({ hg: 1, ag: 0 });
  });
});

// --- bumpScore -------------------------------------------------------------

describe('bumpScore', () => {
  it('moves both sides equally on a draw', () => {
    expect(bumpScore({ hg: 0, ag: 0 }, 1)).toEqual({ hg: 1, ag: 1 });
    expect(bumpScore({ hg: 2, ag: 2 }, 1)).toEqual({ hg: 3, ag: 3 });
  });

  it('clamps draw decrement at 0 (no negative goals)', () => {
    expect(bumpScore({ hg: 0, ag: 0 }, -1)).toEqual({ hg: 0, ag: 0 });
  });

  it('moves only the winning home side on home wins', () => {
    expect(bumpScore({ hg: 1, ag: 0 }, 1)).toEqual({ hg: 2, ag: 0 });
  });

  it('moves only the winning away side on away wins', () => {
    expect(bumpScore({ hg: 0, ag: 1 }, 1)).toEqual({ hg: 0, ag: 2 });
  });

  it("won't let a winner decrement below loser+1 (preserves win/loss outcome)", () => {
    // 1-0 cannot become 0-0 (would be a draw) — stays 1-0.
    expect(bumpScore({ hg: 1, ag: 0 }, -1)).toEqual({ hg: 1, ag: 0 });
    // 2-1 cannot become 1-1 — stays 2-1.
    expect(bumpScore({ hg: 2, ag: 1 }, -1)).toEqual({ hg: 2, ag: 1 });
  });

  it('caps winner at MAX_GOALS=5', () => {
    expect(bumpScore({ hg: 5, ag: 0 }, 1)).toEqual({ hg: 5, ag: 0 });
    expect(bumpScore({ hg: 4, ag: 0 }, 5)).toEqual({ hg: 5, ag: 0 });
  });
});

// --- computeStandings ------------------------------------------------------

describe('computeStandings', () => {
  it('returns all 20 PL teams in the seed', () => {
    const s = computeStandings({});
    expect(s).toHaveLength(20);
  });

  it('produces a baseline ordering matching the seed when no results applied', () => {
    const s = computeStandings({});
    // Arsenal seeded at the top with 73 pts; Wolves at the bottom with 18.
    expect(s[0].short).toBe('ARS');
    expect(s[s.length - 1].short).toBe('WOL');
  });

  it('sorts by points first, then GD, then GF, then name', () => {
    const s = computeStandings({});
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1];
      const b = s[i];
      if (a.points !== b.points) {
        expect(a.points).toBeGreaterThanOrEqual(b.points);
      } else if (a.gd !== b.gd) {
        expect(a.gd).toBeGreaterThanOrEqual(b.gd);
      } else if (a.gf !== b.gf) {
        expect(a.gf).toBeGreaterThanOrEqual(b.gf);
      } else {
        expect(a.name.localeCompare(b.name)).toBeLessThanOrEqual(0);
      }
    }
  });

  it('awards 3 points + a win to the home side on a home win', () => {
    const baseline = computeStandings({});
    const tot = baseline.find((t) => t.short === 'TOT')!;
    const eve = baseline.find((t) => t.short === 'EVE')!;

    // M38-TOT-EVE: Spurs home, Everton away. 1-0 home win.
    const s = computeStandings({ 'M38-TOT-EVE': { hg: 1, ag: 0 } });
    const totAfter = s.find((t) => t.short === 'TOT')!;
    const eveAfter = s.find((t) => t.short === 'EVE')!;

    expect(totAfter.points).toBe(tot.points + 3);
    expect(totAfter.won).toBe(tot.won + 1);
    expect(totAfter.played).toBe(tot.played + 1);
    expect(eveAfter.lost).toBe(eve.lost + 1);
    expect(eveAfter.points).toBe(eve.points);
  });

  it('awards 1 point each on a draw and updates drawn counts', () => {
    const baseline = computeStandings({});
    const tot = baseline.find((t) => t.short === 'TOT')!;
    const eve = baseline.find((t) => t.short === 'EVE')!;

    const s = computeStandings({ 'M38-TOT-EVE': { hg: 1, ag: 1 } });
    const totAfter = s.find((t) => t.short === 'TOT')!;
    const eveAfter = s.find((t) => t.short === 'EVE')!;

    expect(totAfter.points).toBe(tot.points + 1);
    expect(totAfter.drawn).toBe(tot.drawn + 1);
    expect(eveAfter.points).toBe(eve.points + 1);
    expect(eveAfter.drawn).toBe(eve.drawn + 1);
  });

  it('updates GF / GA / GD on both sides', () => {
    const baseline = computeStandings({});
    const tot = baseline.find((t) => t.short === 'TOT')!;
    const eve = baseline.find((t) => t.short === 'EVE')!;

    const s = computeStandings({ 'M38-TOT-EVE': { hg: 3, ag: 1 } });
    const totAfter = s.find((t) => t.short === 'TOT')!;
    const eveAfter = s.find((t) => t.short === 'EVE')!;

    expect(totAfter.gf).toBe(tot.gf + 3);
    expect(totAfter.ga).toBe(tot.ga + 1);
    expect(totAfter.gd).toBe(tot.gd + 2);
    expect(eveAfter.gf).toBe(eve.gf + 1);
    expect(eveAfter.ga).toBe(eve.ga + 3);
    expect(eveAfter.gd).toBe(eve.gd - 2);
  });

  it('ignores a result for an unknown match id', () => {
    const baseline = computeStandings({});
    const s = computeStandings({ 'M99-FAKE-FIXTURE': { hg: 9, ag: 0 } });
    expect(s.map((x) => x.points)).toEqual(baseline.map((x) => x.points));
  });

  it('produces the same ordering regardless of result-key insertion order', () => {
    const a: Results = {
      'M38-TOT-EVE': { hg: 1, ag: 0 },
      'M36-WHU-ARS': { hg: 0, ag: 2 },
    };
    const b: Results = {
      'M36-WHU-ARS': { hg: 0, ag: 2 },
      'M38-TOT-EVE': { hg: 1, ag: 0 },
    };
    expect(computeStandings(a).map((t) => t.short))
      .toEqual(computeStandings(b).map((t) => t.short));
  });
});

// --- survivalProbabilities -------------------------------------------------

describe('survivalProbabilities', () => {
  it('returns a probability for every seeded team', () => {
    const surv = survivalProbabilities({}, 200);
    expect(Object.keys(surv).sort()).toEqual(TEAMS.map((t) => t.short).sort());
  });

  it('returns values in [0, 1] for every team', () => {
    const surv = survivalProbabilities({}, 200);
    for (const p of Object.values(surv)) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for the same locked input (seeded RNG)', () => {
    const a = survivalProbabilities({}, 500);
    const b = survivalProbabilities({}, 500);
    expect(a).toEqual(b);
  });

  it('is deterministic when results are locked, regardless of insertion order', () => {
    const r1: Results = {
      'M38-TOT-EVE': { hg: 2, ag: 1 },
      'M37-CHE-TOT': { hg: 0, ag: 0 },
    };
    const r2: Results = {
      'M37-CHE-TOT': { hg: 0, ag: 0 },
      'M38-TOT-EVE': { hg: 2, ag: 1 },
    };
    expect(survivalProbabilities(r1, 300)).toEqual(survivalProbabilities(r2, 300));
  });

  it('differs when locked results change (sanity: different input → different output)', () => {
    const tot_wins_all: Results = {
      'M35-AVL-TOT': { hg: 0, ag: 3 }, // Spurs win away
      'M36-TOT-LEE': { hg: 3, ag: 0 },
      'M37-CHE-TOT': { hg: 0, ag: 3 },
      'M38-TOT-EVE': { hg: 3, ag: 0 },
    };
    const tot_loses_all: Results = {
      'M35-AVL-TOT': { hg: 3, ag: 0 },
      'M36-TOT-LEE': { hg: 0, ag: 3 },
      'M37-CHE-TOT': { hg: 3, ag: 0 },
      'M38-TOT-EVE': { hg: 0, ag: 3 },
    };
    const wins = survivalProbabilities(tot_wins_all, 1000);
    const loses = survivalProbabilities(tot_loses_all, 1000);
    // Spurs winning all 4 should give higher survival than losing all 4.
    expect(wins.TOT).toBeGreaterThan(loses.TOT);
  });

  it('Burnley and Wolves are essentially gone in the seed (mathematically near-impossible)', () => {
    const surv = survivalProbabilities({}, 1000);
    // Both seeded at ≤20 pts with very negative GD; survival should be ~0.
    expect(surv.BUR).toBeLessThan(0.05);
    expect(surv.WOL).toBeLessThan(0.05);
  });
});

// --- simulateAll -----------------------------------------------------------

describe('simulateAll', () => {
  it('produces a score for every match in the fixture list', () => {
    const out = simulateAll();
    for (const m of MATCHES) {
      expect(out[m.id]).toBeDefined();
      const s = out[m.id] as Score;
      expect(s.hg).toBeGreaterThanOrEqual(0);
      expect(s.ag).toBeGreaterThanOrEqual(0);
    }
  });

  it('clamps every goal count at MAX_GOALS=5', () => {
    // Run many trials to surface any scores that slip past the cap.
    for (let i = 0; i < 50; i++) {
      const out = simulateAll();
      for (const id in out) {
        const s = out[id] as Score;
        expect(s.hg).toBeLessThanOrEqual(5);
        expect(s.ag).toBeLessThanOrEqual(5);
      }
    }
  });
});
