# ERRORS.md

## 2026-07-09 nav mismatch remained after first cleanup

Issue: The first cleanup fixed generators and some current pages but did not normalize old historical generated HTML already committed under `previews/`.

Evidence: Older dated preview files still had a hardcoded nav block with Home, Dashboard, Picks, Previews, Results, Odds, Recaps, and Articles, missing Lab, Stats, and Join.

Correction: Add a repo-wide public shell normalizer and make the verifier fail if any public HTML has hardcoded nav/footer. Future cleanup should target both generators and existing generated artifacts.
