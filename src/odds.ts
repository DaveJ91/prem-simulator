// Match outcome probabilities (home / draw / away). Edit these to override.
//
// Each row's three values must sum to 1.0.
//
// Provenance:
//   [bk]  Bookmaker decimal odds (Bet365 / Sky Sports etc), normalised to remove overround.
//   [pm]  Predictive-model figure cited by a betting preview site.
//   [est] My own estimate where the match is too far out for published odds —
//         calibrated to be in line with bookmaker pricing for similar matchups.
//
// Last refreshed: May 2026.

export type MatchProbs = { home: number; draw: number; away: number };

export const MATCH_PROBABILITIES: Record<string, MatchProbs> = {
  // MW35
  'M35-AVL-TOT': { home: 0.46, draw: 0.24, away: 0.30 }, // [pm]  Aston Villa v Tottenham (covers.com / Dimers model)
  'M35-CHE-NFO': { home: 0.57, draw: 0.24, away: 0.19 }, // [bk]  Chelsea v Forest (1.66 / 4.00 / 5.00)

  // MW36
  'M36-TOT-LEE': { home: 0.42, draw: 0.26, away: 0.32 }, // [est] Tottenham v Leeds — relegation 6-pointer at THS, slight Spurs edge
  'M36-WHU-ARS': { home: 0.06, draw: 0.14, away: 0.80 }, // [bk]  West Ham v Arsenal (Arsenal 2/9, draw 6/1, WHU 16/1)
  'M36-NFO-NEW': { home: 0.36, draw: 0.25, away: 0.39 }, // [bk]  Forest v Newcastle (Bet365 via Stats Insider)

  // MW37
  'M37-CHE-TOT': { home: 0.55, draw: 0.24, away: 0.21 }, // [est] Chelsea v Tottenham — Chelsea heavy favourites at home
  'M37-NEW-WHU': { home: 0.55, draw: 0.22, away: 0.23 }, // [est] Newcastle v West Ham — Newcastle 1.5-goal favourites
  'M37-MUN-NFO': { home: 0.58, draw: 0.22, away: 0.20 }, // [est] Man Utd v Forest — Utd at Old Trafford
  'M37-LEE-BHA': { home: 0.34, draw: 0.27, away: 0.39 }, // [est] Leeds v Brighton — Brighton slight away favourites

  // MW38 (final day, all 16:00 BST)
  'M38-TOT-EVE': { home: 0.40, draw: 0.27, away: 0.33 }, // [est] Tottenham v Everton — Spurs slight home edge
  'M38-WHU-LEE': { home: 0.36, draw: 0.26, away: 0.38 }, // [est] West Ham v Leeds — even, Leeds form slightly better
  'M38-NFO-BOU': { home: 0.32, draw: 0.27, away: 0.41 }, // [est] Forest v Bournemouth — Bournemouth in stronger form
};

// Distribution of the winning margin when a non-draw occurs. Indexed by margin (1, 2, 3, 4+).
// Used by the Monte Carlo simulator to generate plausible scorelines.
export const WIN_MARGIN_DIST: number[] = [0.50, 0.30, 0.15, 0.05];

// Distribution of goals scored by each side in a draw (so 0-0, 1-1, 2-2, 3-3 ...).
export const DRAW_GOALS_DIST: number[] = [0.32, 0.42, 0.20, 0.06];
