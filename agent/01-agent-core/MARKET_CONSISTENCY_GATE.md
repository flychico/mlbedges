# Market Consistency Gate

This gate prevents LyDia from publishing same-game picks that cannot logically fit the same projected game script.

## Core rule

The book may offer both sides of a market menu. LyDia may not label contradictory markets as official picks.

Example of an invalid official card:

```text
Rays ML
Yankees -1.5
```

Those cannot both win. If Tampa Bay wins the game, Yankees -1.5 loses. If Yankees -1.5 wins, Tampa Bay ML loses.

## Run line sanity check

Before labeling any run line as value, verify:

1. The selected team direction matches the model projection.
2. A favorite -1.5 pick is only valid when the selected team is projected to win and the run distribution supports a multi-run win.
3. If Team A is the projected winner, Team B -1.5 is automatically rejected.
4. If the projected margin is inside 1 run, reject -1.5 unless there is separate run-distribution evidence.
5. Do not treat plus-money price as value unless the true cover probability clears breakeven probability.

## Moneyline/run-line conflict rule

If the agent identifies Team A ML as value and Team B -1.5 as value in the same game, flag a model error.

Required action:

```text
Reject the opposing -1.5 run line.
Recalculate the run-line probabilities.
Do not publish either contradictory pair as official picks.
```

## Allowed same-game relationships

If Team A is the projected winner, the agent may consider:

- Team A ML
- Team A -1.5 only with supported multi-run win probability
- Team B +1.5 only as a separate value lean, not as a paired official pick unless explicitly framed as a middle/hedge strategy
- Totals only if the total thesis does not conflict with the side thesis

## LyDia product rule

LyDia paid cards are not hedge/middle cards by default. Keep the official card clean and easy to understand.
