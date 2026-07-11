#!/usr/bin/env node
"use strict";

/*
  Adds the real LyDia Coach object to the current learning summary.
  It never changes model weights, thresholds, picks, or results.
  Readiness requires BOTH:
  - at least 7 current-model graded days
  - at least 20 current-model official moneyline picks
*/

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const RESULTS = path.join(ROOT, "data", "results.json");
const SUMMARY = path.join(ROOT, "data", "learning-summary.json");
const MIN_DAYS = 7;
const MIN_PICKS = 20;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}
function num(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function first(...values) { return values.find(v => num(v) !== null) ?? null; }
function isCurrentModelPick(p, day) {
  const learning = p.learning || {};
  const version = String(learning.model_version || p.modelVersion || p.model_version || "");
  const source = String(day.source || learning.result_source || "");
  return source === "published-picks" || version.includes("moneyline-v2-strict-probability-gate");
}
function normalizePick(p, day) {
  const ml = p.moneyline || {};
  const learning = p.learning || {};
  const result = p.mlResult || p.result || learning.result || "NG";
  return {
    pick: ml.pick || p.pick || null,
    result,
    model_probability: first(learning.model_probability, ml.prob, p.model_probability),
    lab_score: first(learning.lab_score, p.labScore, p.lab_score, ml.edgeScore),
    raw_edge: first(learning.raw_edge, ml.rawEdge, p.raw_edge),
    clv_result: learning.clv_result || p.clv_result || "not_tracked",
    pitcher_edge_team: learning.pitcher_edge_team || (p.pitcherEdge && p.pitcherEdge.team) || null,
    pitcher_gap: first(learning.pitcher_gap, p.pitcherEdge && p.pitcherEdge.gap),
    bullpen_label: learning.bullpen_label || (p.bullpen && p.bullpen.label) || null,
    bullpen_model_version: learning.bullpen_model_version ||
      (p.bullpen && p.bullpen.pick_team && p.bullpen.pick_team.source_version) ||
      "bullpen-fatigue-v3-runs-aware"
  };
}
function record(rows) {
  const wins = rows.filter(x => x.result === "W").length;
  const losses = rows.filter(x => x.result === "L").length;
  return { wins, losses, total: wins + losses, rate: wins + losses ? wins / (wins + losses) : null };
}
function pct(v) { return typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "-"; }

function buildRecommendations(rows) {
  const recs = [];
  const overall = record(rows);
  const highProb = record(rows.filter(x => num(x.model_probability) !== null && x.model_probability >= 0.78));
  const baseProb = record(rows.filter(x => num(x.model_probability) !== null && x.model_probability >= 0.72 && x.model_probability < 0.78));
  const highRating = record(rows.filter(x => num(x.lab_score) !== null && x.lab_score >= 85));
  const pitcherSupported = record(rows.filter(x => x.pitcher_edge_team && x.pitcher_edge_team === x.pick));
  const bullpenCaution = record(rows.filter(x => x.bullpen_label === "Adds caution" || x.bullpen_label === "Both bullpens stressed"));
  const beatClose = rows.filter(x => x.clv_result === "beat_close").length;
  const lostClose = rows.filter(x => x.clv_result === "lost_close").length;

  recs.push(`Current-model official record: ${overall.wins}-${overall.losses}${overall.rate !== null ? ` (${pct(overall.rate)})` : ""}.`);

  if (highProb.total >= 5 && baseProb.total >= 5) {
    recs.push(`Probability review: 78%+ picks are ${highProb.wins}-${highProb.losses}; 72% to 77.9% picks are ${baseProb.wins}-${baseProb.losses}. Review the gap, but do not change the 72% gate from this report alone.`);
  } else {
    recs.push("Probability review: the 72% versus 78% buckets still need more samples before a threshold recommendation.");
  }

  if (highRating.total >= 5) {
    recs.push(`Lab Rating review: 8.5+ official picks are ${highRating.wins}-${highRating.losses}. Compare this with the complete official set before considering a rating-gate change.`);
  } else {
    recs.push("Lab Rating review: fewer than five 8.5+ official picks are graded, so the 8.0 gate remains unchanged.");
  }

  if (pitcherSupported.total >= 5) {
    recs.push(`Pitcher support review: pitcher-supported official picks are ${pitcherSupported.wins}-${pitcherSupported.losses}.`);
  }

  if (bullpenCaution.total) {
    recs.push(`Bullpen v3 review: ${bullpenCaution.total} official pick${bullpenCaution.total === 1 ? "" : "s"} carried material bullpen caution. Review these separately before changing the runs-aware formula.`);
  } else {
    recs.push("Bullpen v3 review: no current-model official picks with major bullpen caution are in the graded sample.");
  }

  if (beatClose + lostClose >= 5) {
    recs.push(`Market review: ${beatClose} tracked picks beat the close and ${lostClose} lost to the close.`);
  } else {
    recs.push("Market review: closing-price coverage is still too small for a useful CLV conclusion.");
  }

  recs.push("Human approval remains required for every model or threshold change.");
  return recs;
}

function main() {
  if (!fs.existsSync(RESULTS) || !fs.existsSync(SUMMARY)) {
    throw new Error("Results or learning summary is missing. Run grading and generate-learning-summary first.");
  }

  const results = readJson(RESULTS);
  const summary = readJson(SUMMARY);
  const days = results.days || {};
  const currentDays = [];
  const currentRows = [];

  for (const [date, day] of Object.entries(days)) {
    const picks = Array.isArray(day.picks) ? day.picks : [];
    const rows = picks
      .filter(p => isCurrentModelPick(p, day))
      .map(p => normalizePick(p, day))
      .filter(p => p.pick && p.result !== "NG");

    if (rows.length) {
      currentDays.push(date);
      for (const row of rows) currentRows.push({ ...row, date });
    }
  }

  const dayCount = new Set(currentDays).size;
  const pickCount = currentRows.length;
  const ready = dayCount >= MIN_DAYS && pickCount >= MIN_PICKS;

  summary.coach = {
    status: ready ? "review_ready" : "collecting",
    title: ready ? "First evidence-based model review is ready" : "Collecting a trustworthy current-model sample",
    summary: ready
      ? `LyDia has ${dayCount} current-model graded days and ${pickCount} current-model official picks. The coach can now identify review questions, but it cannot change the model automatically.`
      : `LyDia has ${dayCount} of ${MIN_DAYS} required current-model days and ${pickCount} of ${MIN_PICKS} required current-model official picks. Recommendations remain paused until both minimums are reached.`,
    current_model_days: dayCount,
    current_model_picks: pickCount,
    minimum_days: MIN_DAYS,
    minimum_picks: MIN_PICKS,
    bullpen_model_owner: "bullpen-fatigue-v3-runs-aware",
    recommendations: ready ? buildRecommendations(currentRows) : [],
    hard_stop: "Coach findings are review prompts only. No automatic threshold, weight, formula, publishing, or betting change is permitted."
  };

  writeJson(SUMMARY, summary);
  if (summary.latest_date) {
    writeJson(path.join(ROOT, "data", "learning", `${summary.latest_date}.json`), summary);
  }

  console.log(`Coach status: ${summary.coach.status}. Days: ${dayCount}/${MIN_DAYS}. Picks: ${pickCount}/${MIN_PICKS}.`);
}
main();
