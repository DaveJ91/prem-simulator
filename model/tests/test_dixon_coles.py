"""Unit tests for the Dixon-Coles model.

Strategy: tests over a small synthetic 4-team dataset so we can predict the
results by hand and assert known properties (top-table teams have higher
attack, draws sum to 1, etc). No network, no real data.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Make sibling module importable when pytest is run from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dixon_coles import DixonColesModel, _tau  # noqa: E402


# --- _tau correction --------------------------------------------------------

class TestTau:
    """Dixon-Coles tweaks only four cells; everything else is unchanged."""

    def test_returns_one_for_unaffected_cells(self):
        for x, y in [(0, 2), (2, 0), (2, 1), (3, 3), (1, 2)]:
            assert _tau(x, y, 1.0, 1.0, -0.1) == 1.0

    def test_zero_zero_correction(self):
        # τ(0,0) = 1 - λμρ
        assert _tau(0, 0, 1.0, 1.0, -0.1) == pytest.approx(1.1)
        assert _tau(0, 0, 2.0, 1.5, -0.2) == pytest.approx(1.6)

    def test_zero_one_correction(self):
        # τ(0,1) = 1 + λρ
        assert _tau(0, 1, 1.0, 99, -0.1) == pytest.approx(0.9)

    def test_one_zero_correction(self):
        # τ(1,0) = 1 + μρ
        assert _tau(1, 0, 99, 1.0, -0.1) == pytest.approx(0.9)

    def test_one_one_correction(self):
        # τ(1,1) = 1 - ρ  (note: indep of λ, μ)
        assert _tau(1, 1, 99, 99, -0.1) == pytest.approx(1.1)
        assert _tau(1, 1, 99, 99, 0.0) == pytest.approx(1.0)


# --- Synthetic data fixture -------------------------------------------------

@pytest.fixture
def synthetic_matches() -> pd.DataFrame:
    """4 teams, 12 matches (each pair plays twice — home and away).

    A is clearly the best (scores lots, concedes few), D is the worst.
    The model should recover this ordering when fitted.
    """
    base = datetime(2025, 9, 1)
    games = [
        # home, away, hg, ag
        ("A", "B", 3, 0),
        ("A", "C", 4, 1),
        ("A", "D", 5, 0),
        ("B", "A", 0, 2),
        ("B", "C", 2, 1),
        ("B", "D", 3, 1),
        ("C", "A", 0, 3),
        ("C", "B", 1, 1),
        ("C", "D", 2, 1),
        ("D", "A", 0, 4),
        ("D", "B", 0, 2),
        ("D", "C", 1, 2),
    ]
    rows = []
    for i, (h, a, hg, ag) in enumerate(games):
        rows.append({
            "date": base + timedelta(days=i * 7),
            "home": h, "away": a,
            "fthg": hg, "ftag": ag,
            # Mirror goals into xg fields so use_xg tests have data too.
            "hxg": float(hg), "axg": float(ag),
        })
    return pd.DataFrame(rows)


# --- Fit + predict ----------------------------------------------------------

class TestFit:
    def test_fits_without_optimiser_failure(self, synthetic_matches):
        model = DixonColesModel(xi=0.0).fit(synthetic_matches)
        # Convergence shape: ratings exist, ρ and γ are real numbers.
        assert model.teams_ == ["A", "B", "C", "D"]
        assert model.params_ is not None
        assert model.params_.shape == (16,)  # 4 teams × 4 ratings
        assert isinstance(model.rho_, float)
        assert isinstance(model.gamma_, float)

    def test_recovers_team_strength_ordering(self, synthetic_matches):
        """Best team's overall attack should rank highest.

        We don't insist on a specific numerical value (small data, joint MLE),
        but A should beat D on attack rating.
        """
        model = DixonColesModel(xi=0.0).fit(synthetic_matches)
        ratings = model.ratings()
        # Top of `ratings` (sorted by attack desc) should be team A.
        assert ratings.iloc[0]["team"] == "A"
        # Bottom should be team D (the team that lost everything).
        assert ratings.iloc[-1]["team"] == "D"

    def test_xg_mode_runs_when_xg_columns_present(self, synthetic_matches):
        # Smoke: fitting on xG instead of goals still converges.
        model = DixonColesModel(xi=0.0, use_xg=True).fit(synthetic_matches)
        assert model.params_ is not None


class TestPredict:
    @pytest.fixture
    def model(self, synthetic_matches):
        return DixonColesModel(xi=0.0).fit(synthetic_matches)

    def test_score_grid_sums_to_one(self, model):
        grid = model.predict_score_grid("A", "B")
        assert grid.shape == (9, 9)  # max_goals=8 → 0..8 inclusive
        assert grid.sum() == pytest.approx(1.0, abs=1e-9)

    def test_score_grid_has_no_negative_probabilities(self, model):
        # DC τ correction can in pathological cases produce negative cells;
        # the model clips internally and renormalises. Guard the contract.
        grid = model.predict_score_grid("A", "B")
        assert (grid >= -1e-12).all()

    def test_outcome_probabilities_sum_to_one(self, model):
        h, d, a = model.predict_outcome("A", "B")
        assert h + d + a == pytest.approx(1.0, abs=1e-9)

    def test_outcome_probabilities_in_unit_interval(self, model):
        for h, a in [("A", "B"), ("A", "D"), ("D", "A"), ("B", "C")]:
            for p in model.predict_outcome(h, a):
                assert 0.0 <= p <= 1.0

    def test_strong_team_at_home_is_favourite(self, model):
        # A is the strongest, D is the weakest. A at home vs D → A heavy fav.
        ph, _, pa = model.predict_outcome("A", "D")
        assert ph > pa

    def test_unknown_team_raises(self, model):
        with pytest.raises(KeyError):
            model.predict_outcome("A", "XYZ")


# --- ratings() shape --------------------------------------------------------

class TestRatings:
    def test_returns_one_row_per_team_with_expected_columns(self, synthetic_matches):
        model = DixonColesModel(xi=0.0).fit(synthetic_matches)
        df = model.ratings()
        assert len(df) == 4
        for col in ["team", "attack_home", "attack_away",
                    "defence_home", "defence_away", "attack", "defence"]:
            assert col in df.columns

    def test_attack_column_is_average_of_home_and_away(self, synthetic_matches):
        model = DixonColesModel(xi=0.0).fit(synthetic_matches)
        df = model.ratings()
        np.testing.assert_allclose(
            df["attack"].to_numpy(),
            (df["attack_home"].to_numpy() + df["attack_away"].to_numpy()) / 2,
        )


# --- Error handling --------------------------------------------------------

class TestErrors:
    def test_predict_before_fit_raises(self):
        model = DixonColesModel()
        with pytest.raises(RuntimeError):
            model.predict_outcome("A", "B")

    def test_ratings_before_fit_raises(self):
        model = DixonColesModel()
        with pytest.raises(RuntimeError):
            model.ratings()
