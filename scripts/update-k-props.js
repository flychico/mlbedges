#!/usr/bin/env node
"use strict";
/*
  LyDia — fetch pitcher strikeout prop lines (Over/Under) for today's slate.

  - Uses The Odds API per-event endpoint: /events/{id}/odds?markets=pitcher_strikeouts
  - Cost: 1 quota-counted request per event (~15/day). The /events list itself is free.
  - Writes data/k-props/<date>.json and data/k-props/today.json keyed by pitcher name:
    consensus line (median), best over/under prices at that line, book count.
  - No key or missing data → logs and exits 0. The daily run is never blocked.
*/
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const KEY = (process.env.ODDS_API_KEY || "").trim();
const DATE = (process.argv[2] || "").match(/^\d{4}-\d{2}-\d{2}$/)
  ? process.argv[2]
  : new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

async function j(url) { const r = await fetch(url); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
// consensus = the most common posted line (a median can invent a line no book offers)
const consensus = a => {
  const counts = {};
  for (const v of a) counts[v] = (counts[v] || 0) + 1;
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  return Number(Object.entries(counts).sort((x, y) => y[1] - x[1] || Math.abs(x[0] - mean) - Math.abs(y[0] - mean))[0][0]);
};

async function main() {
  if (!KEY) { console.log("ODDS_API_KEY not set — strikeout props skipped."); return; }
  const events = await j(`https://api.the-odds-api.com/v4/sports/baseball_mlb/events?apiKey=${KEY}`);
  // keep events that start on DATE in ET
  const todays = (events || []).filter(e => new Date(e.commence_time).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) === DATE);
  console.log(`K-props: ${todays.length} event(s) on ${DATE}.`);
  const pitchers = {};
  let fetched = 0;

  for (const ev of todays) {
    let data;
    try {
      data = await j(`https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${ev.id}/odds?apiKey=${KEY}&regions=us&markets=pitcher_strikeouts&oddsFormat=american`);
      fetched++;
    } catch (e) { console.warn(`event ${ev.id}: ${e.message}`); continue; }
    // collect per pitcher: [{point, overPrice, underPrice, book}]
    const rows = {};
    for (const bk of data.bookmakers || []) {
      const mkt = (bk.markets || []).find(m => m.key === "pitcher_strikeouts");
      if (!mkt) continue;
      const byPitcher = {};
      for (const o of mkt.outcomes || []) {
        const name = (o.description || "").trim();
        if (!name) continue;
        (byPitcher[name] = byPitcher[name] || {})[o.name === "Over" ? "over" : "under"] = { price: o.price, point: o.point };
      }
      for (const [name, ou] of Object.entries(byPitcher)) {
        const pt = (ou.over && ou.over.point) ?? (ou.under && ou.under.point);
        if (!Number.isFinite(pt)) continue;
        (rows[name] = rows[name] || []).push({ point: pt, over: ou.over ? ou.over.price : null, under: ou.under ? ou.under.price : null, book: bk.key });
      }
    }
    for (const [name, arr] of Object.entries(rows)) {
      const line = consensus(arr.map(r => r.point));
      const atLine = arr.filter(r => Math.abs(r.point - line) < 0.01);
      const bestOver = atLine.filter(r => r.over !== null).sort((a, b) => b.over - a.over)[0] || null;
      const bestUnder = atLine.filter(r => r.under !== null).sort((a, b) => b.under - a.under)[0] || null;
      pitchers[name.toLowerCase()] = {
        name, line,
        over: bestOver ? bestOver.over : null,
        under: bestUnder ? bestUnder.under : null,
        books: arr.length,
        game: `${ev.away_team} @ ${ev.home_team}`
      };
    }
  }

  const out = { date: DATE, generated_at: new Date().toISOString(), source: "the-odds-api pitcher_strikeouts (us region, consensus = median line, best price at line)", events_fetched: fetched, pitchers };
  fs.mkdirSync(path.join(ROOT, "data", "k-props"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "data", "k-props", `${DATE}.json`), JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(ROOT, "data", "k-props", "today.json"), JSON.stringify(out, null, 1));
  console.log(`K-props: wrote lines for ${Object.keys(pitchers).length} pitcher(s) from ${fetched} event call(s).`);
}
main().catch(e => { console.error("k-props error:", e.message); process.exit(0); });
