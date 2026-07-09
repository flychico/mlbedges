# LyDia nav hard clean

Upload these files into the repo root, preserving folders.

## What this fixes

The last cleanup fixed future generated pages, but old historical preview HTML files still had hardcoded navigation. Those files kept showing the old smaller nav on dated preview pages.

This pack adds a maintenance step that scans every public HTML file and forces:

- `<nav id="nav"></nav>`
- `<footer id="footer"></footer>`
- `/js/app.js`
- the correct `renderNav("/section/"); renderFooter();` call

That makes `js/app.js` the only source of truth for navigation.

## Upload files

- `.github/workflows/site-maintenance.yml`
- `scripts/normalize-public-shell.js`
- `scripts/assert-public-clean.js`
- `scripts/generate-recap.js`
- `MEMORY.md`
- `ERRORS.md`

## Run after upload

Run:

`Actions -> Site maintenance cleanup -> Run workflow`

That will rewrite old dated preview pages, old recap pages, and any other public page still using hardcoded nav.

## Do not do

Do not manually edit each old preview page. That is how the mismatch keeps coming back.
