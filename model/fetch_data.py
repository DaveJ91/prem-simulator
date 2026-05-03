"""
Fetch this season's Premier League data.

Two sources:

  1. football-data.co.uk
     CSV of every match this season. Has results (FTHG, FTAG) and bookmaker
     opening odds. Updated daily, free, no API key.

  2. Understat
     Per-match expected goals (xG) for both sides. Free, no API key, but
     requires parsing JSON embedded in HTML — handled by the `understat`
     package or via a small inline scraper here (we use the inline scraper
     so we have one fewer dependency).

Output: a single pandas DataFrame written to data/matches.csv with columns:
    date, home, away, fthg, ftag, hxg, axg, b365_h, b365_d, b365_a

The team-name normalisation map at the bottom of this file is the only thing
that ever needs maintenance — when a team gets renamed (e.g. promoted clubs)
add an entry.
"""

from __future__ import annotations

import json
import re
from io import StringIO
from pathlib import Path

import pandas as pd
import requests

# --- Sources ---------------------------------------------------------------

# football-data.co.uk uses 4-digit season codes: 2526 = 2025/26, E0 = Premier League.
RESULTS_CSV_URL = "https://www.football-data.co.uk/mmz4281/2526/E0.csv"

# Understat exposes per-league JSON embedded in the page source.
UNDERSTAT_URL = "https://understat.com/league/EPL/2025"

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)


# --- Team name normalisation ----------------------------------------------
# football-data.co.uk and Understat use slightly different team names.
# Map both to a canonical short code matching src/data.ts in the React app.
NAME_TO_CODE: dict[str, str] = {
    # football-data.co.uk names
    "Arsenal": "ARS", "Aston Villa": "AVL", "Bournemouth": "BOU",
    "Brentford": "BRE", "Brighton": "BHA", "Burnley": "BUR",
    "Chelsea": "CHE", "Crystal Palace": "CRY", "Everton": "EVE",
    "Fulham": "FUL", "Leeds": "LEE", "Liverpool": "LIV",
    "Man City": "MCI", "Man United": "MUN", "Newcastle": "NEW",
    "Nott'm Forest": "NFO", "Sunderland": "SUN", "Tottenham": "TOT",
    "West Ham": "WHU", "Wolves": "WOL",
    # Understat variants
    "Manchester City": "MCI", "Manchester United": "MUN",
    "Nottingham Forest": "NFO", "Tottenham Hotspur": "TOT",
    "Wolverhampton Wanderers": "WOL", "Brighton & Hove Albion": "BHA",
    "Newcastle United": "NEW", "West Ham United": "WHU",
    "Leeds United": "LEE",
}


def _normalise(name: str) -> str:
    """Return the canonical 3-letter code for a team name, or raise."""
    if name in NAME_TO_CODE:
        return NAME_TO_CODE[name]
    raise KeyError(f"Unknown team name {name!r}; add it to NAME_TO_CODE.")


# --- football-data.co.uk: results + bookmaker odds -----------------------

def fetch_results() -> pd.DataFrame:
    """Pull the season's match results CSV.

    Returns a DataFrame with one row per match played, plus the opening
    Bet365 1X2 odds. Unplayed fixtures aren't in the CSV — that's fine,
    we predict those separately.
    """
    print(f"  → GET {RESULTS_CSV_URL}")
    r = requests.get(RESULTS_CSV_URL, timeout=15)
    r.raise_for_status()
    df = pd.read_csv(StringIO(r.text))

    # Pick out just what we need.
    keep = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG",
            "B365H", "B365D", "B365A"]
    df = df[keep].copy()
    df.columns = ["date", "home", "away", "fthg", "ftag",
                  "b365_h", "b365_d", "b365_a"]

    df["date"] = pd.to_datetime(df["date"], dayfirst=True)
    df["home"] = df["home"].map(_normalise)
    df["away"] = df["away"].map(_normalise)
    return df.dropna(subset=["fthg", "ftag"])


# --- Understat: per-match xG ----------------------------------------------

def fetch_xg() -> pd.DataFrame:
    """Scrape Understat for per-match xG (expected goals).

    Understat hides its data in a JS variable inside the page HTML:
        var datesData = JSON.parse('...');
    We grab the JSON, decode it, and pull (date, home, away, hxG, axG)
    for each played match.
    """
    print(f"  → GET {UNDERSTAT_URL}")
    r = requests.get(UNDERSTAT_URL, timeout=15)
    r.raise_for_status()

    # Understat double-encodes: JSON inside a JS string literal that uses
    # \xNN escapes. Locate the assignment, eval the string carefully.
    match = re.search(r"datesData\s*=\s*JSON\.parse\('([^']+)'\)", r.text)
    if not match:
        raise RuntimeError("Couldn't find datesData blob in Understat HTML.")
    raw = match.group(1).encode("utf-8").decode("unicode_escape")
    games = json.loads(raw)

    rows = []
    for g in games:
        if not g.get("isResult"):  # skip unplayed fixtures
            continue
        rows.append({
            "date": pd.to_datetime(g["datetime"]).normalize(),
            "home": _normalise(g["h"]["title"]),
            "away": _normalise(g["a"]["title"]),
            "hxg": float(g["xG"]["h"]),
            "axg": float(g["xG"]["a"]),
        })
    return pd.DataFrame(rows)


# --- Stitch + cache --------------------------------------------------------

def fetch_all(cache: bool = True) -> pd.DataFrame:
    """Fetch results + xG, merge on (date, home, away), cache to disk."""
    out_path = DATA_DIR / "matches.csv"

    print("Fetching results from football-data.co.uk…")
    results = fetch_results()
    print(f"  ✓ {len(results)} played matches")

    print("Fetching xG from Understat…")
    xg = fetch_xg()
    print(f"  ✓ {len(xg)} matches with xG")

    # Merge on date+home+away. Understat dates are date-only; results are too.
    results["date"] = results["date"].dt.normalize()
    merged = results.merge(xg, on=["date", "home", "away"], how="left")

    missing = merged["hxg"].isna().sum()
    if missing:
        print(f"  ⚠ {missing} matches missing xG — they'll be ignored by xG-based models.")

    if cache:
        merged.to_csv(out_path, index=False)
        print(f"  → wrote {out_path}")
    return merged


if __name__ == "__main__":
    fetch_all()
