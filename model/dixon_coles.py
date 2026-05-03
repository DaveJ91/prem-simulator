"""
Dixon-Coles model for football match prediction.

The original paper: Dixon & Coles (1997), "Modelling Association Football Scores
and Inefficiencies in the Football Betting Market." A standard reference; freely
available online if you want the maths in full.

WHAT THE MODEL ASSUMES
----------------------
For a match between home team `h` and away team `a`, goals scored by each
side are Poisson-distributed with rates:

    λ_home = exp(  α_home[h]  +  β_away[a]  +  γ )
    λ_away = exp(  α_away[a]  +  β_home[h]      )

Where:
    α_home[t]  : team t's "attack strength" when playing at home
    α_away[t]  : team t's "attack strength" when playing away
    β_home[t]  : team t's "defence strength" when playing at home (negative if good defence)
    β_away[t]  : team t's "defence strength" when playing away
    γ          : a global home advantage constant

Higher α = better attack. Lower (more negative) β = better defence (concedes less).

Splitting attack/defence into home/away versions is the "separate ratings" upgrade
that the README calls Tier 1.

DIXON-COLES CORRECTION
----------------------
Vanilla independent-Poisson over-predicts low-score outcomes (0-0, 1-0, 0-1, 1-1)
because in real football, scorelines are slightly correlated — if one side scores
the other often responds. DC adds a multiplicative correction τ(x, y; λ, μ, ρ)
applied only to those four cells. ρ controls the magnitude; ρ ≈ -0.1 is typical.

TIME DECAY
----------
Older matches matter less than recent ones (a team in March is not the same
team it was in August). We weight each match by:

    w(t) = exp(-ξ × days_ago)

ξ = 0.0065 gives a half-life of ~110 days. Standard in the literature.

XG SUPPORT
----------
If `use_xg=True`, we fit on the integer rounded xG values rather than actual
goals. xG is a much smoother, less noisy signal — a team that creates lots of
chances and finishes badly will look "lucky bad" in goals but realistic in xG.

Vanilla Poisson takes integer counts so we round xG to the nearest integer.
That throws away decimals (1.7 xG → 2) but in practice gives a cleaner model;
the alternative is a continuous distribution like Gamma or a Poisson-mixture,
which is more code for marginal gain.

USAGE
-----
    from dixon_coles import DixonColesModel
    df = pd.read_csv("data/matches.csv", parse_dates=["date"])
    model = DixonColesModel(xi=0.0065, use_xg=False).fit(df)
    p_home, p_draw, p_away = model.predict_outcome("TOT", "LEE")
    score_grid = model.predict_score_grid("TOT", "LEE", max_goals=8)

The fitted model also exposes per-team ratings via `model.ratings()` for sanity
checking — you should see top-table sides with high attack and low defence.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import exp, lgamma

import numpy as np
import pandas as pd
from scipy.optimize import minimize


# --- Dixon-Coles correction -----------------------------------------------

def _tau(x: int, y: int, lam: float, mu: float, rho: float) -> float:
    """Multiplicative correction to the joint Poisson PMF for low scores.

    Only the four (x, y) ∈ {(0,0), (0,1), (1,0), (1,1)} are touched. Returns
    1.0 for every other cell, so the rest of the grid is plain independent
    Poisson.
    """
    if x == 0 and y == 0:
        return 1 - lam * mu * rho
    if x == 0 and y == 1:
        return 1 + lam * rho
    if x == 1 and y == 0:
        return 1 + mu * rho
    if x == 1 and y == 1:
        return 1 - rho
    return 1.0


def _log_poisson_pmf(k: int, lam: float) -> float:
    """log P(K=k | Poisson(lam)). lam must be > 0."""
    if lam <= 0:
        return -1e9  # force optimiser away
    return k * np.log(lam) - lam - lgamma(k + 1)


# --- The model -------------------------------------------------------------

@dataclass
class DixonColesModel:
    """Time-decayed Dixon-Coles with separate home/away attack/defence ratings.

    Parameters
    ----------
    xi : float, default 0.0065
        Time-decay rate. Half-life ≈ ln(2) / xi days. 0 disables decay.
    use_xg : bool, default False
        If True, fit on rounded xG instead of actual goals.
    """

    xi: float = 0.0065
    use_xg: bool = False

    # Filled in by .fit():
    teams_: list[str] | None = None
    params_: np.ndarray | None = None
    rho_: float | None = None
    gamma_: float | None = None  # home advantage

    # ---- Parameter packing helpers ----
    # We pack params into a single 1-D array for scipy.optimize:
    #   [ α_home[0..n-1],  α_away[0..n-1],  β_home[0..n-1],  β_away[0..n-1] ]
    # Length: 4n. Plus rho and gamma stored separately.

    def _unpack(self, theta: np.ndarray, n: int):
        ah = theta[0:n]
        aa = theta[n:2*n]
        bh = theta[2*n:3*n]
        ba = theta[3*n:4*n]
        return ah, aa, bh, ba

    def _neg_log_likelihood(self, theta: np.ndarray, n: int,
                            home_ix: np.ndarray, away_ix: np.ndarray,
                            hg: np.ndarray, ag: np.ndarray,
                            weights: np.ndarray, rho: float, gamma: float) -> float:
        """Negative log-likelihood across all matches.

        For each match m:
            λ_h = exp( α_home[h]  + β_away[a]  + γ )
            λ_a = exp( α_away[a]  + β_home[h]      )
            ll  = log P(hg | Poi(λ_h)) + log P(ag | Poi(λ_a)) + log τ(hg, ag, ...)
            total += weight[m] * ll
        We minimise -total.
        """
        ah, aa, bh, ba = self._unpack(theta, n)

        log_lam_h = ah[home_ix] + ba[away_ix] + gamma
        log_lam_a = aa[away_ix] + bh[home_ix]
        lam_h = np.exp(log_lam_h)
        lam_a = np.exp(log_lam_a)

        # log Poisson PMF, vectorised:
        from scipy.special import gammaln
        log_p_h = hg * log_lam_h - lam_h - gammaln(hg + 1)
        log_p_a = ag * log_lam_a - lam_a - gammaln(ag + 1)

        # Dixon-Coles τ correction (vectorised over the 4 affected cells)
        tau = np.ones_like(lam_h)
        m00 = (hg == 0) & (ag == 0); tau[m00] = 1 - lam_h[m00] * lam_a[m00] * rho
        m01 = (hg == 0) & (ag == 1); tau[m01] = 1 + lam_h[m01] * rho
        m10 = (hg == 1) & (ag == 0); tau[m10] = 1 + lam_a[m10] * rho
        m11 = (hg == 1) & (ag == 1); tau[m11] = 1 - rho
        # Guard against τ ≤ 0 (would explode log)
        tau = np.clip(tau, 1e-9, None)

        ll = log_p_h + log_p_a + np.log(tau)
        return -float((weights * ll).sum())

    def fit(self, matches: pd.DataFrame) -> "DixonColesModel":
        """Fit the model on a DataFrame of played matches.

        Required columns: date, home, away, fthg, ftag (and hxg, axg if use_xg).
        """
        df = matches.dropna(subset=["fthg", "ftag"]).copy()
        if self.use_xg:
            df = df.dropna(subset=["hxg", "axg"])

        # Time decay weights — most-recent match weight ≈ 1.
        latest = df["date"].max()
        days_ago = (latest - df["date"]).dt.days.to_numpy()
        weights = np.exp(-self.xi * days_ago)

        # Index teams 0..n-1
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

        # ---- Joint optimisation ----
        # We fit α/β jointly with ρ and γ. To make the solution identifiable
        # we'd normally pin one team's α=0 (or sum-zero constraint), but with
        # time decay the optimum is well-defined enough; scipy handles it.
        rho0, gamma0 = -0.1, 0.3
        theta0 = np.zeros(4 * n)

        def packed_obj(params):
            theta = params[:4 * n]
            rho = params[-2]
            gamma = params[-1]
            return self._neg_log_likelihood(
                theta, n, home_ix, away_ix, hg, ag, weights, rho, gamma
            )

        x0 = np.concatenate([theta0, [rho0, gamma0]])
        res = minimize(packed_obj, x0, method="L-BFGS-B",
                       options={"maxiter": 500, "ftol": 1e-7})
        if not res.success:
            print(f"  ⚠ optimiser warning: {res.message}")

        self.teams_ = teams
        self.params_ = res.x[:4 * n]
        self.rho_ = float(res.x[-2])
        self.gamma_ = float(res.x[-1])
        return self

    # ---- Inference --------------------------------------------------------

    def _lambdas(self, home: str, away: str) -> tuple[float, float]:
        if self.teams_ is None or self.params_ is None:
            raise RuntimeError("Call .fit() first.")
        ix = {t: i for i, t in enumerate(self.teams_)}
        if home not in ix or away not in ix:
            raise KeyError(f"Unknown team(s): {home}, {away}")
        n = len(self.teams_)
        ah, aa, bh, ba = self._unpack(self.params_, n)
        h, a = ix[home], ix[away]
        lam_h = exp(ah[h] + ba[a] + self.gamma_)
        lam_a = exp(aa[a] + bh[h])
        return lam_h, lam_a

    def predict_score_grid(self, home: str, away: str,
                           max_goals: int = 8) -> np.ndarray:
        """Probability matrix p[i, j] = P(home scores i, away scores j).

        Sums to ~1 (truncated at max_goals). Apply DC τ correction to the
        four low-score cells before returning.
        """
        from scipy.stats import poisson
        lam_h, lam_a = self._lambdas(home, away)
        ph = poisson.pmf(np.arange(max_goals + 1), lam_h)
        pa = poisson.pmf(np.arange(max_goals + 1), lam_a)
        grid = np.outer(ph, pa)
        # DC correction
        grid[0, 0] *= 1 - lam_h * lam_a * self.rho_
        grid[0, 1] *= 1 + lam_h * self.rho_
        grid[1, 0] *= 1 + lam_a * self.rho_
        grid[1, 1] *= 1 - self.rho_
        # Re-normalise so it sums to exactly 1.
        return grid / grid.sum()

    def predict_outcome(self, home: str, away: str) -> tuple[float, float, float]:
        """Return (P(home win), P(draw), P(away win))."""
        g = self.predict_score_grid(home, away)
        p_home = float(np.tril(g, -1).sum())  # rows > cols
        p_draw = float(np.diag(g).sum())
        p_away = float(np.triu(g, 1).sum())
        return p_home, p_draw, p_away

    def ratings(self) -> pd.DataFrame:
        """Per-team attack/defence ratings, sorted by overall attack.

        Useful sanity check — top-table sides should have high attack and
        low (negative) defence numbers.
        """
        if self.teams_ is None:
            raise RuntimeError("Call .fit() first.")
        n = len(self.teams_)
        ah, aa, bh, ba = self._unpack(self.params_, n)
        df = pd.DataFrame({
            "team": self.teams_,
            "attack_home": ah, "attack_away": aa,
            "defence_home": bh, "defence_away": ba,
        })
        df["attack"] = (df["attack_home"] + df["attack_away"]) / 2
        df["defence"] = (df["defence_home"] + df["defence_away"]) / 2
        return df.sort_values("attack", ascending=False).reset_index(drop=True)
