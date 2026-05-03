"""
Bayesian hierarchical match-prediction model in PyMC.

This is the same shape of model as Dixon-Coles (Poisson goals, attack/defence
team ratings, home advantage) but fitted in a fully Bayesian way: instead of
a single point-estimate per parameter we get a *posterior distribution*. That
buys us:

  1. Uncertainty intervals on every prediction.
     Instead of "Forest survives with 92.4% probability" you get
     "Forest survives with 92.4% [88.1, 95.7]" — credibility interval from
     the posterior.

  2. Hierarchical shrinkage.
     Each team's attack rating is drawn from a *league-wide* distribution
     N(0, σ_attack). This regularises extreme estimates: a team that's
     played 4 matches and won 4 doesn't get rated absurdly high; the prior
     pulls it back toward the league mean.

  3. Honest treatment of small samples.
     Posterior is wider when you have less data — no false confidence.

WHEN TO USE THIS VS DIXON-COLES
-------------------------------
  - DC is faster (~1s to fit), simpler, and a perfectly fine point estimate.
  - Bayesian is slower (~30-90s), needs PyMC installed (~500MB), but gives
    proper uncertainty.

For the React app's odds.ts we use DC. The Bayesian model is here for when
you want to dig into "how confident are we, really?"

THE MODEL
---------
For each match m played by home team h(m) and away team a(m):

    α_attack[t]   ~ Normal(0, σ_attack)         # team t's attack rating
    α_defence[t]  ~ Normal(0, σ_defence)        # team t's defence rating
    γ             ~ Normal(0.3, 0.1)            # global home advantage

    log(λ_home[m]) = α_attack[h] - α_defence[a] + γ
    log(λ_away[m]) = α_attack[a] - α_defence[h]

    goals_home[m] ~ Poisson(λ_home[m])
    goals_away[m] ~ Poisson(λ_away[m])

Note this version uses one attack and one defence rating per team (not split
home/away) — it's the "classic" Bayesian football model. Splitting would add
4n parameters; with limited data per team it doesn't help.

We don't add the Dixon-Coles τ correction in the Bayesian version because
sampling a discontinuous correction term plays badly with HMC (Hamiltonian
Monte Carlo). Vanilla independent Poisson is close enough at this scale.

USAGE
-----
    from bayesian import BayesianModel
    df = pd.read_csv("data/matches.csv", parse_dates=["date"])
    model = BayesianModel(use_xg=True).fit(df, draws=2000, tune=1000)
    p_home, p_draw, p_away, ci = model.predict_outcome("TOT", "LEE")
    # ci is a dict with 'home', 'draw', 'away' each holding (lo, hi) at 89%.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class BayesianModel:
    """Hierarchical Poisson regression for football match outcomes.

    Parameters
    ----------
    use_xg : bool, default False
        Fit on rounded xG instead of actual goals.
    """

    use_xg: bool = False

    # Filled by fit():
    teams_: list[str] | None = None
    trace_: object | None = None  # arviz InferenceData

    def fit(self, matches: pd.DataFrame,
            draws: int = 2000, tune: int = 1000,
            chains: int = 4, target_accept: float = 0.9) -> "BayesianModel":
        """Sample the posterior. Slow! Defaults take 60-90s on a laptop.

        Lower draws/tune for a quick smoke test (e.g. draws=500, tune=500).
        """
        import pymc as pm  # local import keeps pymc optional

        df = matches.dropna(subset=["fthg", "ftag"]).copy()
        if self.use_xg:
            df = df.dropna(subset=["hxg", "axg"])

        teams = sorted(set(df["home"]) | set(df["away"]))
        ix = {t: i for i, t in enumerate(teams)}
        n = len(teams)
        home_ix = df["home"].map(ix).to_numpy()
        away_ix = df["away"].map(ix).to_numpy()

        if self.use_xg:
            hg = df["hxg"].round().astype(int).to_numpy()
            ag = df["axg"].round().astype(int).to_numpy()
        else:
            hg = df["fthg"].astype(int).to_numpy()
            ag = df["ftag"].astype(int).to_numpy()

        # Build the model. coords lets us label the team dimension cleanly.
        with pm.Model(coords={"team": teams}) as model:
            # League-wide spread on attack/defence ratings.
            sigma_atk = pm.HalfNormal("sigma_atk", 1.0)
            sigma_def = pm.HalfNormal("sigma_def", 1.0)

            # Per-team ratings (the things we actually care about).
            attack = pm.Normal("attack", 0.0, sigma_atk, dims="team")
            defence = pm.Normal("defence", 0.0, sigma_def, dims="team")

            # Global home advantage (in log-rate space).
            home_adv = pm.Normal("home_adv", 0.3, 0.1)

            # Identifiability: pin the mean attack and defence to zero so the
            # latent ratings are interpretable as deviations from average.
            pm.Deterministic("attack_centred",
                             attack - attack.mean())
            pm.Deterministic("defence_centred",
                             defence - defence.mean())

            # Match-level rates (log-link).
            log_lam_h = attack[home_ix] - defence[away_ix] + home_adv
            log_lam_a = attack[away_ix] - defence[home_ix]
            lam_h = pm.math.exp(log_lam_h)
            lam_a = pm.math.exp(log_lam_a)

            # Likelihood: observed goals are Poisson around the rate.
            pm.Poisson("goals_h_obs", mu=lam_h, observed=hg)
            pm.Poisson("goals_a_obs", mu=lam_a, observed=ag)

            print(f"  Sampling {chains} chains × {draws} draws (tune={tune})…")
            self.trace_ = pm.sample(
                draws=draws, tune=tune, chains=chains,
                target_accept=target_accept, progressbar=True,
                random_seed=42,
            )

        self.teams_ = teams
        return self

    # ---- Inference --------------------------------------------------------

    def _posterior_lambdas(self, home: str, away: str) -> tuple[np.ndarray, np.ndarray]:
        """Return arrays of λ_home, λ_away — one sample per posterior draw."""
        if self.trace_ is None or self.teams_ is None:
            raise RuntimeError("Call .fit() first.")
        post = self.trace_.posterior

        # Stack chain × draw into one flat sample dim for convenience.
        atk = post["attack"].stack(sample=("chain", "draw")).values  # (n_teams, n_samples)
        df  = post["defence"].stack(sample=("chain", "draw")).values
        gam = post["home_adv"].stack(sample=("chain", "draw")).values  # (n_samples,)

        ix = {t: i for i, t in enumerate(self.teams_)}
        h, a = ix[home], ix[away]
        log_lam_h = atk[h] - df[a] + gam
        log_lam_a = atk[a] - df[h]
        return np.exp(log_lam_h), np.exp(log_lam_a)

    def predict_outcome(self, home: str, away: str,
                        n_score_samples: int = 1) -> dict:
        """Posterior predictive 1X2 probabilities with credibility intervals.

        We sample one (or more) Poisson scoreline per posterior draw, then
        compute the empirical W/D/L proportion. Returns:
            {
              'home': mean_p, 'draw': mean_p, 'away': mean_p,
              'ci_home': (lo, hi), 'ci_draw': (lo, hi), 'ci_away': (lo, hi),
            }
        with 89% credibility intervals (the usual Bayesian convention).
        """
        lam_h, lam_a = self._posterior_lambdas(home, away)
        rng = np.random.default_rng(42)

        # For each posterior draw, simulate n_score_samples actual scorelines.
        # Reshape so we can compute outcome probabilities per-draw.
        s = n_score_samples
        gh = rng.poisson(np.repeat(lam_h, s)).reshape(-1, s)
        ga = rng.poisson(np.repeat(lam_a, s)).reshape(-1, s)

        p_home_per_draw = (gh > ga).mean(axis=1)
        p_draw_per_draw = (gh == ga).mean(axis=1)
        p_away_per_draw = (gh < ga).mean(axis=1)

        def ci(arr):
            return (float(np.quantile(arr, 0.055)), float(np.quantile(arr, 0.945)))

        return {
            "home": float(p_home_per_draw.mean()),
            "draw": float(p_draw_per_draw.mean()),
            "away": float(p_away_per_draw.mean()),
            "ci_home": ci(p_home_per_draw),
            "ci_draw": ci(p_draw_per_draw),
            "ci_away": ci(p_away_per_draw),
        }

    def ratings_summary(self) -> pd.DataFrame:
        """Per-team posterior mean attack/defence with 89% credibility intervals."""
        if self.trace_ is None or self.teams_ is None:
            raise RuntimeError("Call .fit() first.")
        post = self.trace_.posterior
        atk = post["attack"].stack(sample=("chain", "draw")).values
        df  = post["defence"].stack(sample=("chain", "draw")).values

        rows = []
        for i, t in enumerate(self.teams_):
            rows.append({
                "team": t,
                "attack_mean": atk[i].mean(),
                "attack_lo":   np.quantile(atk[i], 0.055),
                "attack_hi":   np.quantile(atk[i], 0.945),
                "defence_mean": df[i].mean(),
                "defence_lo":   np.quantile(df[i], 0.055),
                "defence_hi":   np.quantile(df[i], 0.945),
            })
        return pd.DataFrame(rows).sort_values("attack_mean", ascending=False)
