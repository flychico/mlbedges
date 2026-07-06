# Next Steps for LyDia Agent v2

## Immediate next move

Run V2 on 3 to 5 real slates manually before automating. The goal is to test the methodology, not pretend the first model is perfect.

## Manual testing plan

For each slate:

1. Fill the daily input.
2. Score every game using the edge model.
3. Track all official picks, leans, and no-plays.
4. Capture competitor picks and reasoning.
5. Record the closing line.
6. Grade the result and the process.
7. Update `LESSONS_LEARNED.md`.

## What to evaluate after 5 slates

- Did official picks beat the closing line?
- Did high edge scores perform better than leans?
- Which reasoning tags worked?
- Which signals were noise?
- Did competitor reasoning help or confuse the engine?
- Which markets looked strongest: full game ML, F5 ML, team totals, or totals?
- Was the agent too aggressive or too conservative?

## V3 candidates

- Automated odds pull
- Automated probable pitcher pull
- Automated weather/radar pull
- Competitor scraper
- Website publishing draft generator
- Email/newsletter output
- Member dashboard archive
- Results tracker charts
