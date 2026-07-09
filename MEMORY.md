# MEMORY.md

## 2026-07-09 nav hard clean

Decision: `js/app.js` must be the only navigation and footer source for the public site.

Problem found: Existing historical static pages, especially older dated files under `previews/`, still contained hardcoded nav HTML. Future generators were improved, but the old already-committed pages were still live and could show missing tabs such as Lab, Stats, and Join.

Fix direction:
- Add `scripts/normalize-public-shell.js` to scan existing public HTML files and replace hardcoded nav/footer with shared shell placeholders.
- Run the normalizer inside `Site maintenance cleanup` before the public-clean verifier.
- Strengthen `scripts/assert-public-clean.js` so hardcoded nav/footer fails the workflow.
- Fix `scripts/generate-recap.js` so future recap pages use shared nav/footer directly.

Important: Do not manually patch individual old preview pages. The repo needs a repeatable shell normalization step.
