# Premier League Run-In Simulator

🔗 **Live:** https://prem-sim.vercel.app

A small React app for toggling final-day Premier League results and watching the relegation table react. Inspired by ESPN's NFL playoff machine.

## What it does

- League table for positions 15–20 (FM-styled), with framer-motion row animations on every change.
- Toggle W/D/L (and bump the goal margin) for **Tottenham, West Ham, Nottingham Forest, Leeds** across the final 4 matchweeks of the 2025/26 season.
- Live **Survival %** column, computed via a 10,000-iteration Monte Carlo using per-fixture probabilities and a seeded PRNG so identical inputs give identical results.
- **Simulate** button rolls every remaining game from the same probability table.

## Match probabilities

The probabilities in [`src/odds.ts`](src/odds.ts) feed both the per-cell `Win / Draw / Loss %` display and the survival Monte Carlo.

There are two ways to keep them current:

1. **Hand edit `src/odds.ts`** — fastest for one-off overrides. Each row sums to 1.0.
2. **Regenerate from the Python model** — see [`model/`](model/). Fetches this season's results + xG, fits a time-decayed Dixon-Coles model, writes a fresh `src/odds.ts`. Run on demand or schedule via cron.

## Stack

- **Frontend**: Vite + React + TypeScript, framer-motion for the table animation. No router, no state library.
- **Hosting**: Vercel — every push to `main` auto-deploys.
- **Model (optional)**: Python — pandas + scipy for Dixon-Coles, optional PyMC for the Bayesian variant. See [`model/README.md`](model/README.md).

## Project layout

```
src/                     React app
├── App.tsx              page composition
├── data.ts              team standings + the 12 toggleable fixtures
├── odds.ts              per-fixture H/D/A probabilities (auto-generated, can hand-edit)
├── standings.ts         pure logic: standings calc, Monte Carlo survival sim, Poisson sim
├── logos.ts             team-code → logo path + display name
├── useMediaQuery.ts     hook used to switch desktop ↔ mobile fixture layout
└── components/
    ├── LeagueTable.tsx  FM-styled table with row animation
    ├── FixturesGrid.tsx 4-column matchweek grid (desktop) / per-club stack (mobile)
    └── Toggle.tsx       W/D/L segmented control

model/                   Python prediction pipeline (optional)
├── README.md            full maths walkthrough
├── fetch_data.py        pulls results from football-data.co.uk + xG from Understat
├── dixon_coles.py       time-decayed Dixon-Coles with home/away splits + xG
├── bayesian.py          PyMC hierarchical alternative with credibility intervals
└── generate_odds.py     orchestrator → writes src/odds.ts
```

## Local dev

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

### Refresh the model probabilities

```bash
cd model
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python generate_odds.py            # default: Dixon-Coles + xG, ~10s end-to-end
```

This rewrites `src/odds.ts`. Commit + push, Vercel redeploys.

For a daily cron on a home server, see the snippet at the bottom of [`model/README.md`](model/README.md).
