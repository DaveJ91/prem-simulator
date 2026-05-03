# Match prediction models

Python pipeline that estimates `home / draw / away` probabilities for each
remaining fixture and writes them to `src/odds.ts`. The React app then uses
those probabilities both to display per-cell odds and to drive the survival
% Monte Carlo.

```
fetch_data.py    →  data/matches.csv     (this season's matches + xG + bookie odds)
        ↓
dixon_coles.py   →  fitted model          (Tier 1+2: time-decayed Dixon-Coles, optional xG)
bayesian.py      →  fitted model          (Tier 3: PyMC hierarchical, has posterior CIs)
        ↓
generate_odds.py →  src/odds.ts           (TypeScript constants for the React app)
```

## Quick start

```bash
cd model
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python generate_odds.py            # fetches data → fits DC+xG → writes odds.ts
```

The first run downloads ~50KB from football-data.co.uk and ~200KB from
Understat, fits the model in ~1s, and rewrites `src/odds.ts`. Total: ~10s.

Other modes:

```bash
python generate_odds.py --no-xg            # use actual goals (worse signal)
python generate_odds.py --no-fetch         # skip download, use cached CSV
python generate_odds.py --bayesian         # ~60s, gives proper uncertainty
```

To freeze a manual override for one fixture (e.g. you want to use Bet365's
explicit price), edit `MANUAL_OVERRIDES` in `generate_odds.py` and re-run.

---

## Why three models?

| Model | What it does well | Cost |
|---|---|---|
| Dixon-Coles + actual goals | Baseline. Captures team strength + home advantage. | ~1s |
| **Dixon-Coles + xG (recommended)** | xG is much less noisy than goals. Same speed. | ~1s |
| Bayesian hierarchical (PyMC) | Proper uncertainty intervals, regularises small samples. | ~60s, +500MB deps |

For the React app's odds, **Dixon-Coles + xG is what you want**. The Bayesian
model is here to show what serious football statisticians use and so you can
inspect posterior credibility intervals if you care.

---

## The maths, conceptually

### Vanilla Poisson regression

The simplest model says each team has a single attack rating `α[t]` (how
many goals they tend to score) and a defence rating `β[t]` (how many they
tend to concede). For a match between `h` and `a`:

```
λ_home = exp( α[h] + β[a] + γ )    # γ = home advantage
λ_away = exp( α[a] + β[h] )

goals_home ~ Poisson(λ_home)
goals_away ~ Poisson(λ_away)
```

Fit by maximum likelihood. Predict by integrating over the joint Poisson PMF.

### Dixon-Coles upgrades

Three improvements layered on top:

1. **Separate home and away ratings.**
   In real football, "Burnley at home" is a different team from
   "Burnley away" beyond a flat home boost. Each team gets four numbers:
   `α_home, α_away, β_home, β_away`.

2. **Low-score correction.**
   Vanilla Poisson treats home and away goals as independent, but real
   matches show correlation at low scores — when one team scores, the
   other often responds. Dixon & Coles add a tiny multiplicative
   correction τ to four cells:

   ```
   τ(0,0) = 1 - λ·μ·ρ
   τ(0,1) = 1 + λ·ρ
   τ(1,0) = 1 + μ·ρ
   τ(1,1) = 1 - ρ
   ```

   ρ is fitted alongside the team ratings (typically -0.1 to -0.2). All
   other (goals_h, goals_a) cells are unchanged.

3. **Time decay.**
   September matches matter less than April matches. We weight each
   match's contribution to the likelihood by:

   ```
   w(match) = exp(-ξ · days_since_match)
   ```

   ξ = 0.0065 gives a half-life of ~110 days, which is the value
   Dixon-Coles found worked well in their original 1997 paper. Same value
   still tends to come out best on modern data.

### Why xG, not goals?

A team that creates 2.0 expected goals every game and finishes 1.2 of them
is a *good* team having *bad luck*. Vanilla Poisson on goals scored would
rate them as worse than they are. xG smooths out finishing variance — what
matters is the underlying chance creation.

We round xG to nearest int because Poisson takes integer counts. This loses
some precision but is much simpler than the alternatives (Gamma likelihood,
Skellam distribution, mixture models), and in practice gives ~the same
predictive accuracy.

### Bayesian version

Same model shape, but each parameter is a *distribution* not a number:

```
σ_attack, σ_defence ~ HalfNormal(1)              # league-wide spread
α[t]                ~ Normal(0, σ_attack)         # per-team attack
β[t]                ~ Normal(0, σ_defence)        # per-team defence
γ                   ~ Normal(0.3, 0.1)            # home advantage prior

log λ_home = α[h] − β[a] + γ
log λ_away = α[a] − β[h]
goals      ~ Poisson(λ)
```

PyMC samples the posterior using HMC (Hamiltonian Monte Carlo). 4 chains × 2000
draws gives 8000 samples per parameter. Inference is then "for each posterior
draw, compute λ_home, λ_away, sample a Poisson scoreline, count W/D/L."

The two key things this gives that DC doesn't:
- **Credibility intervals** on every probability — "Spurs win 32% [27, 38]".
- **Hierarchical shrinkage** — extreme team estimates get pulled toward the
  league mean, especially for teams with few matches. Acts as natural
  regularisation.

The trade-off is fitting time (60-90s) and a heavy install (PyMC pulls in
PyTensor and friends, ~500MB).

---

## Sanity checks

After fitting, look at `model.ratings()` (DC) or `model.ratings_summary()`
(Bayesian). Top-table teams should have:

- High attack ratings (positive, large)
- Low (negative) defence ratings (concedes less)

If Burnley is rated higher than Arsenal, something's wrong — most likely
the team-name normalisation in `fetch_data.py` mapped two teams to the
same code.

For the predicted probabilities themselves, they should roughly track
bookmaker prices. Compare against [Oddschecker](https://www.oddschecker.com)
or [Pinnacle](https://www.pinnacle.com). Within ~5pp on most matches is
respectable; >10pp off and there's a bug.

---

## Automating it

Run on a schedule on the mini PC. Daily 6am cron:

```cron
0 6 * * * cd /home/dave/projects/prem-simulator && \
  /home/dave/projects/prem-simulator/model/.venv/bin/python \
  model/generate_odds.py && \
  git add src/odds.ts && \
  git commit -m "chore: refresh odds [auto]" && \
  git push
```

Vercel auto-redeploys on push, so the live site has fresh probabilities
every morning. Total cost: zero.

---

## Limitations

- **No injuries / suspensions / cup runs.** A model knowing Spurs are
  missing 7 first-team players would price differently. We don't.
- **No manager change shocks.** A new appointment usually delivers a
  short-term bounce; not modelled.
- **No fixture difficulty scheduling.** A team that's just lost an
  exhausting Europa semi-final the Thursday before isn't downgraded.
- **Same team strength every match.** Our team ratings don't update
  during the run-in itself (we re-fit periodically; we don't update game
  by game).

For the bottom-of-the-table 12-fixture window we care about, these
omissions probably introduce ~3-5% noise per fixture. Below the level
the user can perceive, well above the level a sharp bookmaker can.
