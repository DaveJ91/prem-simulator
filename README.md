# Premier League Run-In Simulator

🔗 **Live:** https://prem-sim.vercel.app

A small React app for toggling final-day Premier League results and watching the relegation table react. Inspired by ESPN's NFL playoff machine.

## What it does

- League table for positions 15–20 (FM-styled), with framer-motion row animations on every change.
- Toggle W/D/L (and bump the goal margin) for **Tottenham, West Ham, Nottingham Forest, Leeds** across the final 4 matchweeks of the 2025/26 season.
- Live **Survival %** column, computed via a 10,000-iteration Monte Carlo using per-fixture probabilities and a seeded PRNG so identical inputs give identical results.
- **Simulate** button rolls every remaining game from the same probability table.

## Match probabilities

Edit [`src/odds.ts`](src/odds.ts) to override individual fixtures. Each row is annotated:

- `[bk]` — bookmaker odds (Bet365 / Sky Sports), normalised
- `[pm]` — predictive-model figure cited by a betting preview site
- `[est]` — estimate where market prices aren't published yet

## Stack

Vite + React + TypeScript, framer-motion for the table animation, no router, no state library. Deployed on Vercel — every push to `main` auto-deploys.

## Local dev

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```
