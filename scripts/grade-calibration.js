#!/usr/bin/env node
/*
  LyDia — full-slate calibration grading.

  Grades EVERY game the model analyzed (official picks, value watches,
  watchlist, and passes) against final scores, so learning can measure
  calibration — does 65% mean 65%? — instead of only seeing the ~1
  official pick per day that clears the strict gates.

  - Input:  data/member-brief/<date>.json (every game's model read, locked pregame)
  - Output: appends to data/calibration/calibration_log.csv (idempotent per date+gamePk)
  - Never touches the public record: this is a learning ledger, not results.

  Usage: node scripts/grade-calibration.js [YYYY-MM-DD]   (defaults to yesterday ET)
*/
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOG = path.join(ROOT, "data", "calibration", "calibration_log.csv");
const HEADER = "date,gamePk,matchup,model_side,status,model_prob,market_prob,lab_score,best_price,result,final_score\n";

const DATE = (process.argv[2] || "").match(/^\d{4}-\d{2}-\d{2}$/)
  ? process.argv[2]
  : new Date(Date.now() - 24 * 3600 * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function csvField(s) {
  s = String(s == null ? "" : s);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const briefPath = path.join(ROOT, "data", "member-brief", `${DATE}.json`);
  if (!fs.existsSync(briefPath)) { console.log(`No member brief for ${DATE} — nothing to calibrate.`); return; }
  const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"));
  const games = Array.isArray(brief.games) ? brief.games : [];
  if (!games.length) { console.log(`Member brief for ${DATE} has no games.`); return; }

  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}`);
  if (!res.ok) { console.warn(`MLB schedule lookup failed: HTTP ${res.status}`); return; }
  const sched = await res.json();
  const finals = {};
  for (const d of sched.dates || []) {
    for (const g of d.games || []) {
      if ((g.status && g.status.abstractGameState) === "Final" && g.teams) {
        finals[g.gamePk] = { awayScore: g.teams.away.score, homeScore: g.teams.home.score };
      }
    }
  }

  // Scratched-starter detection: a game where the analyzed starter never pitched
  // is voided from the learning ledgers — grading it would measure roster news, not the model.
  const starterCache = {};
  async function actualStarters(gamePk) {
    if (starterCache[gamePk]) return starterCache[gamePk];
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
      if (!res.ok) return null;
      const box = await res.json();
      const first = side => {
        const tb = box.teams && box.teams[side];
        const id = tb && tb.pitchers && tb.pitchers[0];
        return id ? (((tb.players || {})["ID" + id] || {}).person || {}).fullName || null : null;
      };
      return (starterCache[gamePk] = { away: first("away"), home: first("home") });
    } catch (e) { return null; }
  }
  const isScratched = (analyzed, actual) => analyzed && analyzed !== "TBD" && actual && analyzed.trim().toLowerCase() !== actual.trim().toLowerCase();
  const VOIDLOG = path.join(ROOT, "data", "calibration", "voided_log.csv");
  const voidRows = [];
  async function gameVoided(g) {
    const pe = g.pitcher_edge || {};
    const actual = await actualStarters(g.game_pk);
    if (!actual) return false;
    if (isScratched(pe.away_pitcher, actual.away)) { voidRows.push(`${DATE},${g.game_pk},away,${csvField(pe.away_pitcher)},${csvField(actual.away)}`); return true; }
    if (isScratched(pe.home_pitcher, actual.home)) { voidRows.push(`${DATE},${g.game_pk},home,${csvField(pe.home_pitcher)},${csvField(actual.home)}`); return true; }
    return false;
  }

  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, HEADER);
  const existing = new Set(
    fs.readFileSync(LOG, "utf8").split("\n").slice(1)
      .map(l => l.split(",").slice(0, 2).join(","))
      .filter(Boolean)
  );

  let added = 0, skippedDone = 0, notFinal = 0;
  const rows = [];
  for (const g of games) {
    const key = `${DATE},${g.game_pk}`;
    if (existing.has(key)) { skippedDone++; continue; }
    const f = finals[g.game_pk];
    if (!f || f.awayScore == null || f.homeScore == null) { notFinal++; continue; }
    if (!g.side || typeof g.model_probability !== "number") continue;
    if (await gameVoided(g)) continue;
    const homeWon = f.homeScore > f.awayScore;
    const pickWon = g.side === "home" ? homeWon : !homeWon;
    rows.push([
      DATE, g.game_pk, csvField(g.game), csvField(g.pick_team),
      g.status || "", g.model_probability,
      (g.market && typeof g.market.no_vig_probability === "number") ? g.market.no_vig_probability : "",
      typeof g.lab_score === "number" ? g.lab_score : "",
      (g.market && g.market.best_price != null) ? g.market.best_price : "",
      pickWon ? "W" : "L", `${f.awayScore}-${f.homeScore}`
    ].join(","));
    added++;
  }
  if (rows.length) fs.appendFileSync(LOG, rows.join("\n") + "\n");

  // ---- Attribution ledger: the INPUTS behind each graded game, for the
  // n>=150 weight-relevance analysis. All values are pick-side relative. ----
  const ALOG = path.join(ROOT, "data", "calibration", "attribution_log.csv");
  const AHEAD = "date,gamePk,status,result,model_prob,lab,pitcher_gap,kbb_diff,gb_pick,babip_pick,off_delta_diff,bullpen_gap\n";
  if (!fs.existsSync(ALOG)) fs.writeFileSync(ALOG, AHEAD);
  const aSeen = new Set(fs.readFileSync(ALOG, "utf8").split("\n").slice(1).map(l => l.split(",").slice(0, 2).join(",")).filter(Boolean));
  const aRows = [];
  const n2 = v => (typeof v === "number" && isFinite(v)) ? v : "";
  for (const g of games) {
    const key = `${DATE},${g.game_pk}`;
    if (aSeen.has(key)) continue;
    const f = finals[g.game_pk];
    if (!f || f.awayScore == null || f.homeScore == null || !g.side) continue;
    if (await gameVoided(g)) continue;
    const homeWon = f.homeScore > f.awayScore;
    const won = (g.side === "home") === homeWon;
    const pe = g.pitcher_edge || {};
    const pickHome = g.side === "home";
    const pAdv = pickHome ? pe.home_advanced : pe.away_advanced;
    const oAdv = pickHome ? pe.away_advanced : pe.home_advanced;
    const pScore = pickHome ? pe.home_score : pe.away_score;
    const oScore = pickHome ? pe.away_score : pe.home_score;
    const of_ = g.offense_form || {};
    const pOff = pickHome ? of_.home : of_.away;
    const oOff = pickHome ? of_.away : of_.home;
    const bp = g.bullpen || {};
    aRows.push([DATE, g.game_pk, g.status || "", won ? "W" : "L",
      n2(g.model_probability), n2(g.lab_score),
      (isFinite(pScore) && isFinite(oScore)) ? pScore - oScore : "",
      (pAdv && oAdv && isFinite(pAdv.kbb_pct) && isFinite(oAdv.kbb_pct)) ? Number((pAdv.kbb_pct - oAdv.kbb_pct).toFixed(4)) : "",
      pAdv && isFinite(pAdv.gb_pct) ? pAdv.gb_pct : "",
      pAdv && isFinite(pAdv.babip) ? pAdv.babip : "",
      (pOff && oOff && isFinite(pOff.delta_ops) && isFinite(oOff.delta_ops)) ? Number((pOff.delta_ops - oOff.delta_ops).toFixed(3)) : "",
      (bp.opponent && bp.pick_team && isFinite(bp.opponent.score) && isFinite(bp.pick_team.score)) ? bp.opponent.score - bp.pick_team.score : ""
    ].join(","));
  }
  if (aRows.length) fs.appendFileSync(ALOG, aRows.join("\n") + "\n");

  // ---- shadow model v3 ledger (A/B vs the official v2) ----
  const SLOG = path.join(ROOT, "data", "calibration", "shadow_v3_log.csv");
  if (!fs.existsSync(SLOG)) fs.writeFileSync(SLOG, "date,gamePk,p_home_v2,p_home_v3,home_won\n");
  const sExisting = new Set(fs.readFileSync(SLOG, "utf8").split("\n").slice(1).map(l => l.split(",").slice(0, 2).join(",")).filter(Boolean));
  const sRows = [];
  for (const g of games) {
    const key = `${DATE},${g.game_pk}`;
    if (sExisting.has(key)) continue;
    const f = finals[g.game_pk];
    const v3 = g.model_v3;
    if (!f || !v3 || !Number.isFinite(v3.p_home) || !Number.isFinite(v3.p_home_v2)) continue;
    if (await gameVoided(g)) continue;
    sRows.push([DATE, g.game_pk, v3.p_home_v2, v3.p_home, f.homeScore > f.awayScore ? 1 : 0].join(","));
  }
  if (sRows.length) fs.appendFileSync(SLOG, sRows.join("\n") + "\n");
  if (voidRows.length) {
    if (!fs.existsSync(VOIDLOG)) fs.writeFileSync(VOIDLOG, "date,gamePk,side,analyzed_starter,actual_starter\n");
    const seen = new Set(fs.readFileSync(VOIDLOG, "utf8").split("\n"));
    const fresh = [...new Set(voidRows)].filter(r => !seen.has(r));
    if (fresh.length) fs.appendFileSync(VOIDLOG, fresh.join("\n") + "\n");
    console.log(`Voided ${new Set(voidRows).size} game(s) — starter scratched (see voided_log.csv).`);
  }
  console.log(`Calibration ${DATE}: logged ${added}, already-logged ${skippedDone}, not-final ${notFinal}, slate ${games.length}. Shadow v3: ${sRows.length} graded.`);
}

main().catch(e => { console.error("calibration error:", e.message); process.exit(0); });
