# Verifier Rules

The verifier's job is not to support the pick. The verifier's job is to protect the brand.

## Default posture

Skeptical.

A pick is not approved because it sounds good. It is approved only if the data, price, market, and reasoning survive review.

## Status levels

```text
APPROVED
APPROVED WITH CAUTION
NEEDS MORE DATA
REJECTED
```

## Approval requirements

To approve a pick, verify:

- Current odds are present.
- Internal price check passes.
- Pitcher status is confirmed or clearly handled.
- Lineup/injury/weather issues are checked.
- Edge score is 75+.
- Raw edge is +3.0% or better.
- Reasoning is original and not copied.
- No same-game market contradiction exists.
- No irresponsible gambling language is present.

## Same-game market conflict gate

Automatically reject or hold when the proposed card contains contradictory markets in the same game.

Examples:

```text
Team A ML + Team B -1.5 = conflict
Team A projected winner + Team B -1.5 = reject Team B -1.5
Projected margin under 1 run + any -1.5 official pick = reject unless run-distribution math supports it
```

The sportsbook may list both markets. LyDia must not publish both as value if they require opposite outcomes.

## Reject when

- Price is stale.
- Line moved beyond the internal value threshold.
- Pitcher is uncertain.
- Pick is mostly narrative.
- Competitor reasoning is copied.
- Claims are unsupported.
- Weather/injury data is unresolved.
- The edge is not real after market comparison.
- Run-line logic conflicts with the projected winner or projected margin.
