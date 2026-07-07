# Next Steps for LyDia Agent

## Immediate

Run LyDia on 3 to 5 real slates manually before automating. The goal is to test the methodology, not pretend the first model is perfect.

Track:
- Closing line value
- Whether the pick won or lost
- Whether the reasoning was right
- Whether the verifier should have caught anything
- Whether the market consistency gate worked

## Automation path

1. Put this package in GitHub.
2. Add a Python runner for morning cards and night grading.
3. Connect reliable data sources for odds, scores, weather, lineups, and probable pitchers.
4. Add GitHub Actions schedules.
5. Save generated cards, verifier reports, and postmortems to the repo.
6. Add email delivery after the system has been tested.
7. Add website/member publishing only after the verifier has proven reliable.

## Future upgrade candidates

- True probability conversion layer
- Closing line value dashboard
- Competitor source grading
- Signal-level performance tracking
- Automated lineup/injury rechecks
- Member delivery workflow
