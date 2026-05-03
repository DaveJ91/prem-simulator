export type ClubKey = 'TOT' | 'WHU' | 'NFO' | 'LEE';
export type Outcome = 'W' | 'D' | 'L';

export type TeamSeed = {
  name: string;
  short: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
};

export type Match = {
  id: string;
  matchday: number;
  home: string;
  away: string;
  kickoff: string; // UK local time, e.g. "Sun 24 May, 16:00 BST"
};

export const TEAMS: TeamSeed[] = [
  { name: 'Arsenal',                 short: 'ARS', played: 34, won: 22, drawn: 7,  lost: 5,  gf: 64, ga: 26, points: 73 },
  { name: 'Manchester City',         short: 'MCI', played: 33, won: 21, drawn: 7,  lost: 5,  gf: 66, ga: 29, points: 70 },
  { name: 'Manchester United',       short: 'MUN', played: 34, won: 17, drawn: 10, lost: 7,  gf: 60, ga: 46, points: 61 },
  { name: 'Liverpool',               short: 'LIV', played: 34, won: 17, drawn: 7,  lost: 10, gf: 57, ga: 44, points: 58 },
  { name: 'Aston Villa',             short: 'AVL', played: 35, won: 17, drawn: 7,  lost: 11, gf: 48, ga: 44, points: 58 },
  { name: 'Brentford',               short: 'BRE', played: 35, won: 14, drawn: 9,  lost: 12, gf: 52, ga: 46, points: 51 },
  { name: 'Brighton & Hove Albion',  short: 'BHA', played: 35, won: 13, drawn: 11, lost: 11, gf: 49, ga: 42, points: 50 },
  { name: 'Bournemouth',             short: 'BOU', played: 34, won: 11, drawn: 16, lost: 7,  gf: 52, ga: 52, points: 49 },
  { name: 'Chelsea',                 short: 'CHE', played: 34, won: 13, drawn: 9,  lost: 12, gf: 53, ga: 45, points: 48 },
  { name: 'Fulham',                  short: 'FUL', played: 34, won: 14, drawn: 6,  lost: 14, gf: 44, ga: 46, points: 48 },
  { name: 'Everton',                 short: 'EVE', played: 34, won: 13, drawn: 8,  lost: 13, gf: 41, ga: 41, points: 47 },
  { name: 'Sunderland',              short: 'SUN', played: 35, won: 12, drawn: 11, lost: 12, gf: 37, ga: 46, points: 47 },
  { name: 'Newcastle United',        short: 'NEW', played: 35, won: 13, drawn: 6,  lost: 16, gf: 49, ga: 51, points: 45 },
  { name: 'Crystal Palace',          short: 'CRY', played: 33, won: 11, drawn: 10, lost: 12, gf: 36, ga: 39, points: 43 },
  { name: 'Leeds United',            short: 'LEE', played: 35, won: 10, drawn: 13, lost: 12, gf: 47, ga: 52, points: 43 },
  { name: 'Nottingham Forest',       short: 'NFO', played: 34, won: 10, drawn: 9,  lost: 15, gf: 41, ga: 45, points: 39 },
  { name: 'West Ham United',         short: 'WHU', played: 35, won: 9,  drawn: 9,  lost: 17, gf: 42, ga: 61, points: 36 },
  { name: 'Tottenham Hotspur',       short: 'TOT', played: 35, won: 9,  drawn: 10, lost: 16, gf: 45, ga: 54, points: 37 },
  { name: 'Burnley',                 short: 'BUR', played: 35, won: 4,  drawn: 8,  lost: 23, gf: 35, ga: 71, points: 20 },
  { name: 'Wolverhampton Wanderers', short: 'WOL', played: 35, won: 3,  drawn: 9,  lost: 23, gf: 25, ga: 63, points: 18 },
];

export const TOGGLEABLE_CLUBS: { key: ClubKey; name: string; short: string }[] = [
  { key: 'TOT', name: 'Tottenham',    short: 'TOT' },
  { key: 'WHU', name: 'West Ham',     short: 'WHU' },
  { key: 'NFO', name: 'Nottm Forest', short: 'NFO' },
  { key: 'LEE', name: 'Leeds',        short: 'LEE' },
];

// Each match listed once, even if both clubs are toggleable. Kickoff times are UK local.
// Played fixtures are removed from this list and their result baked into TEAMS above.
// Last update: AVL 1-2 TOT (Sun 3 May 2026) — recorded 2026-05-03.
export const MATCHES: Match[] = [
  { id: 'M36-TOT-LEE', matchday: 36, home: 'TOT', away: 'LEE', kickoff: 'Mon 11 May, 20:00 BST' },
  { id: 'M37-CHE-TOT', matchday: 37, home: 'CHE', away: 'TOT', kickoff: 'Sun 17 May, 14:00 BST' },
  { id: 'M38-TOT-EVE', matchday: 38, home: 'TOT', away: 'EVE', kickoff: 'Sun 24 May, 16:00 BST' },

  { id: 'M36-WHU-ARS', matchday: 36, home: 'WHU', away: 'ARS', kickoff: 'Sun 10 May, 16:30 BST' },
  { id: 'M37-NEW-WHU', matchday: 37, home: 'NEW', away: 'WHU', kickoff: 'Sun 17 May, 14:00 BST' },
  { id: 'M38-WHU-LEE', matchday: 38, home: 'WHU', away: 'LEE', kickoff: 'Sun 24 May, 16:00 BST' },

  { id: 'M35-CHE-NFO', matchday: 35, home: 'CHE', away: 'NFO', kickoff: 'Sat 2 May, 17:30 BST' },
  { id: 'M36-NFO-NEW', matchday: 36, home: 'NFO', away: 'NEW', kickoff: 'Sat 9 May, 15:00 BST' },
  { id: 'M37-MUN-NFO', matchday: 37, home: 'MUN', away: 'NFO', kickoff: 'Sun 17 May, 14:00 BST' },
  { id: 'M38-NFO-BOU', matchday: 38, home: 'NFO', away: 'BOU', kickoff: 'Sun 24 May, 16:00 BST' },

  { id: 'M37-LEE-BHA', matchday: 37, home: 'LEE', away: 'BHA', kickoff: 'Sun 17 May, 15:00 BST' },
];
