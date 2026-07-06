# LyDia GitHub From Scratch Build

This package gives you a clean GitHub setup for LyDia.

The goal is simple:

1. GitHub stores the site files.
2. GitHub Actions runs the daily agent automatically.
3. The agent creates a daily preview page.
4. The grading agent checks finished games and updates the public results page.

## What to upload

Upload everything in this folder to the root of your GitHub repository.

Do not upload this folder inside another folder. The `.github` folder must sit directly inside the repo root.

Correct:

```
.github/workflows/daily-lydia-agent.yml
agents/daily_picks_agent.py
index.html
css/style.css
js/app.js
```

Wrong:

```
lydia_github_from_scratch_v1/.github/workflows/daily-lydia-agent.yml
```

## Required GitHub settings

### 1. Turn on GitHub Actions

Go to:

Repo > Settings > Actions > General

Set:

- Actions permissions: Allow all actions and reusable workflows
- Workflow permissions: Read and write permissions
- Check: Allow GitHub Actions to create and approve pull requests, if shown

### 2. Add repository secrets

Go to:

Repo > Settings > Secrets and variables > Actions > New repository secret

Add:

- `ODDS_API_KEY`
- `OPENAI_API_KEY`

`ODDS_API_KEY` is the most important one. Without it, the agent can still run, but it cannot compare LyDia's model to market prices.

`OPENAI_API_KEY` is optional for better writeups. Without it, the agent writes a basic preview from templates.

### 3. Set GitHub Pages

Go to:

Repo > Settings > Pages

Set:

- Source: Deploy from a branch
- Branch: main
- Folder: / root

Save.

### 4. Run the agent manually first

Go to:

Repo > Actions > LyDia Daily Picks Agent > Run workflow

Run it once manually.

Then check:

- `data/daily/latest.json`
- `previews/YYYY-MM-DD.html`
- `previews/index.html`
- `index.html`

If those files update, the system works.

### 5. Automatic schedule

The daily picks agent is scheduled for 10:00 AM New York time.

The grading agent is scheduled for 9:00 AM New York time.

Schedules only run after the workflow file is on the default branch.

## Important competitor note

The agent can fetch public competitor pages listed in:

```
data/config/competitor_sources.json
```

This is only a research signal. Do not copy paid picks, private content, or full competitor writeups.

The clean workflow is:

- Competitor/public expert signals tell us what the market is talking about.
- LyDia's model and price logic decide whether we agree or disagree.
- LyDia writes original analysis.

## Daily workflow

The daily agent does this:

1. Pulls the MLB schedule.
2. Pulls team standings and form.
3. Pulls market odds if `ODDS_API_KEY` is available.
4. Calculates model probabilities.
5. Compares model probability to no-vig market probability.
6. Selects official picks only when the edge is above the threshold.
7. Creates the preview page.
8. Updates the homepage.

## Grading workflow

The grading agent does this:

1. Reads past daily pick files.
2. Checks final MLB scores.
3. Grades moneyline picks as win or loss.
4. Updates `data/results/results.json`.
5. Rebuilds `results.html`.

## If the workflow does not run automatically

Check these in order:

1. Is `.github/workflows/daily-lydia-agent.yml` on the `main` branch?
2. Is GitHub Actions enabled?
3. Does Actions have read and write permission?
4. Did you run it manually once from the Actions tab?
5. Are the secrets named exactly `ODDS_API_KEY` and `OPENAI_API_KEY`?
6. Did the workflow fail in the logs?
7. Is there currently an MLB slate available for today's date?

