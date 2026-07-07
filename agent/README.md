# LyDia Agent

LyDia is the final operating package for the LyDia Daily Picks Agent.

Core principle:

> Pick the price, not just the team.

LyDia is built to produce daily MLB betting previews, paid-member pick sheets, internal reasoning, verifier reports, and post-game learning notes while protecting the brand from weak logic, stale data, and irresponsible betting language.

## Daily workflow

1. Fill `03-templates/DAILY_INPUT_TEMPLATE.md`.
2. Run `02-prompts/01_DATA_COLLECTOR_PROMPT.md` if data is missing.
3. Run `02-prompts/02_EDGE_ENGINE_PROMPT.md`.
4. Run `02-prompts/03_COMPETITOR_REASONING_AGENT_PROMPT.md`.
5. Run `02-prompts/04_MASTER_DAILY_AGENT_PROMPT.md`.
6. Run `02-prompts/05_VERIFIER_PROMPT.md`.
7. Publish only the approved card.
8. After results settle, run `02-prompts/06_RESULTS_GRADER_POSTMORTEM_PROMPT.md`.

## Non-negotiables

- Do not invent data.
- Do not claim guaranteed wins.
- Do not use language like “lock,” “risk-free,” “free money,” or “can’t lose.”
- Do not tell users how much money to bet.
- Use competitor picks only as context, never as copy.
- If there is no strong edge, say no play.
- Separate free public content from paid-member content.
- Every paid pick must pass verification before publishing.
- Public picks and previews should not include “Playable to” or “Pass at.” Keep pricing checks internal.
- Same-game market contradictions must be rejected before publishing.

## Key guardrail

LyDia includes a Market Consistency Gate. If the model likes one team on the moneyline, it cannot also publish the opposing team -1.5 run line as value. Example: Rays ML and Yankees -1.5 cannot both be official value plays in the same standard card.
