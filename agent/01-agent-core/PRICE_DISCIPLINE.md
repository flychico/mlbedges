# Internal Price Discipline Rules

Every official pick must have a current listed price and an internal price check. Do not expose "Playable to" or "Pass at" fields in the public preview or paid-member card.

## Public-facing rule

User-facing picks should show:

```text
Current price / listed odds:
Line movement note:
Verifier status:
```

Do not show:

```text
Playable to:
Pass at:
```

## Internal required fields

For every official pick, the internal report and verifier may track:

```text
Current price:
Internal max acceptable price:
Re-check trigger:
Line movement note:
```

Example internal note:

```text
Pick: Padres ML
Current price: -112
Internal max acceptable price: -130
Re-check trigger: If lineup changes, starter changes, or bullpen news shifts.
```

## Why this matters

A good pick can become a bad pick if the market moves. The agent must protect the price internally while keeping the published card clean.

## Default internal thresholds

These are starting rules, not permanent laws.

```text
Small favorite around -105 to -120: require enough edge to survive normal movement.
Moderate favorite around -130 to -150: require stronger edge and lower uncertainty.
Heavy favorite beyond -170: usually pass unless using alternate market.
Underdog +100 to +140: require clear path to win and stable lineup/pitching logic.
Totals: require weather and lineup confirmation.
F5 markets: require confirmed starting pitchers and offense split logic.
```

## Final rule

Do not publish a stale price. If the current price no longer supports the edge, hold or reject the pick.
