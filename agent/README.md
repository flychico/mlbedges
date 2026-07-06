# LyDia Agent v2

LyDia Agent v2 is built around one core principle:

> We are not trying to predict winners. We are trying to identify mispriced probabilities.

V1 produced daily MLB previews and paid picks. V2 adds a real methodology layer:

- Edge scoring
- Noise filtering
- Competitor reasoning analysis
- Playable price ranges
- No-play logic
- Closing-line value tracking
- Postmortem grading
- Visible memory files
- A stricter verifier

This package is manual-first and automation-ready. You can run it in ChatGPT/Claude today by copying the prompts and filling the templates. Later, this structure can be moved into GitHub, connected to live data, and scheduled.

## Daily run flow

1. Fill `03-templates/DAILY_INPUT_TEMPLATE_V2.md`.
2. Run `02-prompts/01_DATA_COLLECTOR_PROMPT.md` if data is incomplete.
3. Run `02-prompts/02_EDGE_ENGINE_PROMPT.md` to score the slate.
4. Run `02-prompts/03_COMPETITOR_REASONING_AGENT_PROMPT.md` to process competitor logic.
5. Run `02-prompts/04_MASTER_DAILY_AGENT_PROMPT_V2.md` to create the daily card.
6. Run `02-prompts/05_VERIFIER_PROMPT_V2.md` before publishing.
7. After results, run `02-prompts/06_RESULTS_GRADER_POSTMORTEM_PROMPT.md`.
8. Update the trackers in `06-trackers/`.

## V2 agent stack

```text
Data Collector Agent
↓
Edge Engine Agent
↓
Competitor Reasoning Agent
↓
Pick Candidate Agent
↓
Verifier Agent
↓
No-Play Filter
↓
Publishing Agent
↓
Results Grader
↓
Lessons Learned Memory
```

## Minimum publishing rule

A pick may only be published when it has:

- Confirmed or clearly labeled pitcher status
- Current price and playable range
- Independent LyDia edge score
- Clear market-implied probability comparison
- No major unresolved lineup/weather conflict
- Verifier status of APPROVED or APPROVED WITH CAUTION

No edge, no pick. No shame. Discipline is the product.
