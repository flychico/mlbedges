"""
LyDia Agent manual helper.

This script does not pull live data. It provides basic probability helpers and edge-score calculations.
"""

from __future__ import annotations


def american_to_implied_prob(odds: int | float) -> float:
  """Convert American odds to implied probability as a decimal."""
  odds = float(odds)
  if odds < 0:
    return abs(odds) / (abs(odds) + 100.0)
  return 100.0 / (odds + 100.0)


def no_vig_probs(odds_a: int | float, odds_b: int | float) -> tuple[float, float]:
  """Return no-vig implied probabilities for two-sided market."""
  a = american_to_implied_prob(odds_a)
  b = american_to_implied_prob(odds_b)
  total = a + b
  if total <= 0:
    raise ValueError("Invalid probabilities")
  return a / total, b / total


def raw_edge(lydia_projected_prob: float, market_no_vig_prob: float) -> float:
  """Return raw edge as decimal. Example: .05 = 5 percentage points."""
  return lydia_projected_prob - market_no_vig_prob


def edge_score(
  sp: int,
  offense: int,
  bullpen: int,
  lineup_injury: int,
  park_weather: int,
  market_price: int,
  competitor_signal: int,
) -> int:
  """Calculate total edge score. Raises if category exceeds max."""
  maxes = {
    "sp": 25,
    "offense": 20,
    "bullpen": 15,
    "lineup_injury": 10,
    "park_weather": 10,
    "market_price": 15,
    "competitor_signal": 5,
  }
  values = locals().copy()
  for key, max_value in maxes.items():
    if values[key] < 0 or values[key] > max_value:
      raise ValueError(f"{key} must be between 0 and {max_value}")
  return sp + offense + bullpen + lineup_injury + park_weather + market_price + competitor_signal


def status_from_score(score: int, edge_decimal: float, hard_gate: bool = False) -> str:
  """Return candidate status."""
  if hard_gate:
    return "NO PLAY / HOLD - HARD GATE"
  if edge_decimal < 0.03:
    return "NO PLAY - EDGE TOO SMALL"
  if score >= 85:
    return "STRONG PLAY CANDIDATE"
  if score >= 75:
    return "PLAY CANDIDATE"
  if score >= 65:
    return "LEAN ONLY"
  return "NO PLAY"


if __name__ == "__main__":
  # Example: -120 vs +110
  a, b = no_vig_probs(-120, +110)
  print(f"No-vig probs: A={a:.2%}, B={b:.2%}")
  projected = 0.585
  edge = raw_edge(projected, a)
  score = edge_score(20, 16, 10, 8, 7, 12, 3)
  print(f"Raw edge: {edge:.2%}")
  print(f"Score: {score}")
  print(f"Status: {status_from_score(score, edge)}")
