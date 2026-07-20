#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const LyDiaRead = require("../js/client-facing-read.js");

const ROOT = path.join(__dirname, "..");
const SITE = "https://lydiaslab.com";
const MAX_ITEMS = 18;
const QUERIES = [
  "MLB betting picks Action Network",
  "MLB betting picks Covers",
  "MLB betting picks BettingPros",
  "MLB betting picks Sportsbook Review",
  "MLB betting picks VSiN",
  "MLB odds injuries probable pitchers betting"
];
const ALLOWED = ["action network", "covers", "bettingpros", "sportsbook review", "vsin", "fanduel research", "rotowire"];

// MLB team names/cities so a headline can be confirmed as MLB content, not just
// "from an allowed source." Sources allowed here also cover other sports (WNBA,
// NFL, etc.) and headlines about those leagues were slipping through.
const MLB_TEAMS = [
  "diamondbacks","braves","orioles","red sox","cubs","white sox","reds","guardians",
  "rockies","tigers","astros","royals","angels","dodgers","marlins","brewers","twins",
  "mets","yankees","athletics","phillies","pirates","padres","giants","mariners",
  "cardinals","rays","rangers","blue jays","nationals","d-backs"
];
const OTHER_LEAGUE_SIGNALS = [
  "wnba","nba","nfl","nhl","ncaa","college football","college basketball",
  "premier league","champions league","pga","ufc","mma","nascar","tennis","golf"
];
function isMlbContent(text) {
  const lower = String(text || "").toLowerCase();
  if (OTHER_LEAGUE_SIGNALS.some(s => lower.includes(s))) return false;
  if (lower.includes("mlb") || lower.includes("major league baseball")) return true;
  return MLB_TEAMS.some(t => lower.includes(t));
}

function etToday() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }
function decode(s) { return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function strip(s) { return decode(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decode(m[1]).trim() : "";
}
function parse(xml) {
  return (String(xml || "").match(/<item>[\s\S]*?<\/item>/gi) || []).map(block => ({
    title: strip(tag(block, "title")),
    link: strip(tag(block, "link")),
    published_at: strip(tag(block, "pubDate")),
    description: strip(tag(block, "description")),
    source: strip(tag(block, "source"))
  })).filter(x => x.title && x.link);
}
function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }
  catch (e) { return null; }
}
function currentBrief() {
  const date = etToday();
  for (const rel of [`data/member-brief/${date}.json`, "data/member-brief/today.json"]) {
    const x = readJson(rel);
    if (x && x.date === date && Array.isArray(x.games)) return x;
  }
  return null;
}
function shortTeam(name) {
  const two = ["Red Sox", "White Sox", "Blue Jays"].find(x => String(name).endsWith(x));
  return two || (String(name || "").split(" ").pop() || name);
}
function matchedGame(text, brief) {
  if (!brief) return null;
  const lower = text.toLowerCase();
  return brief.games.find(g =>
    [g.away_team, g.home_team].some(n => n && (lower.includes(n.toLowerCase()) || lower.includes(shortTeam(n).toLowerCase())))
  ) || null;
}
function teamAliases(team) {
  const full = String(team || "").trim();
  return [...new Set([full, shortTeam(full)].filter(Boolean))];
}
function explicitSide(item, game) {
  if (!game) return null;
  const text = `${item.title || ""} ${item.description || ""}`.replace(/\s+/g, " ").toLowerCase();
  const teams = [game.away_team, game.home_team];

  for (const team of teams) {
    for (const alias of teamAliases(team)) {
      const a = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`(?:best bet|pick|prediction|moneyline|ml)\\s*(?:is|:|-|–)?\\s*${a}(?:\\b|$)`, "i"),
        new RegExp(`${a}\\s+(?:moneyline|ml|to win|wins|will win)(?:\\b|$)`, "i"),
        new RegExp(`(?:back|take|bet|lean)\\s+${a}(?:\\b|$)`, "i")
      ];
      if (patterns.some(r => r.test(text))) return team;
    }
  }
  return null;
}
function classify(item, brief) {
  const text = `${item.title || ""} ${item.description || ""}`;
  const game = matchedGame(text, brief);
  if (!game) {
    return { section: "market_context", confidence: "no_game_match", game: null, selected_side: null, takeaway: generic(item.title) };
  }

  const selected = explicitSide(item, game);
  const pick = game.pick_team;
  const opponent = pick === game.away_team ? game.home_team : game.away_team;
  const status = game.status === "official_pick" ? "official pick" : game.status === "value_watch" ? "value watch" : game.status || "research";

  if (!selected) {
    return {
      section: "unable_to_classify",
      confidence: "no_explicit_side",
      game: game.game,
      selected_side: null,
      takeaway: `This article matches ${game.game}, but the headline and summary do not clearly identify a selected side. LyDia currently has ${pick} Money Line at ${LyDiaRead.pct(game.model_probability)} model probability and ${LyDiaRead.labRating(game.lab_score)} Lab Rating, with ${status} status. It stays unclassified rather than being counted as agreement.`
    };
  }

  const section = selected === pick ? "lydia_agrees" : selected === opponent ? "lydia_disagrees" : "unable_to_classify";
  const direction = section === "lydia_agrees"
    ? `The outside source explicitly identifies the same side as LyDia: ${pick}.`
    : section === "lydia_disagrees"
      ? `The outside source explicitly identifies ${selected}, the opposite side from LyDia's ${pick} read.`
      : "The selected side could not be matched confidently.";

  return {
    section,
    confidence: "explicit_side",
    game: game.game,
    selected_side: selected,
    takeaway: `${direction} LyDia currently has ${pick} Money Line at ${LyDiaRead.pct(game.model_probability)} model probability and ${LyDiaRead.labRating(game.lab_score)} Lab Rating, with ${status} status. External coverage is context only and cannot change the published pick.`
  };
}
function generic(title) {
  const t = String(title || "").toLowerCase();
  if (/injury|lineup|scratch|activated|\bil\b/.test(t)) return "Availability news can change the matchup and price. Recheck confirmed lineups and probable starters before first pitch.";
  if (/pitcher|starter|strikeout|era|whip/.test(t)) return "Compare this pitching angle with LyDia's Pitcher Matchup Tool and current market price.";
  if (/bullpen|reliever|closer/.test(t)) return "Compare the claim with LyDia's bullpen innings, runs allowed, and back-to-back usage before treating it as meaningful.";
  return "Useful outside market context, but not an official LyDia signal by itself.";
}
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 LyDiaResearchDesk/3.0" }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}
function rssUrl(q) { return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`; }
function allowed(x) {
  const hay = `${x.source} ${x.title}`.toLowerCase();
  const fromAllowedSource = ALLOWED.some(s => hay.includes(s));
  return fromAllowedSource && isMlbContent(`${x.title} ${x.description || ""}`);
}
function dedupe(items) {
  const seen = new Set();
  return items.filter(x => {
    const key = x.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function card(item) {
  return `<article class="card desk-card">
    <div class="source-row"><span class="badge neutral">${esc(item.source || "External source")}</span><span class="small dim">${esc(item.published_label || "Recent")}</span></div>
    <h3><a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
    ${item.game ? `<p class="small dim">Matched game: ${esc(item.game)}${item.selected_side ? ` · Explicit side: ${esc(item.selected_side)}` : ""}</p>` : ""}
    <div class="takeaway"><strong>LyDia read</strong><p>${esc(item.lydia_takeaway)}</p></div>
  </article>`;
}
function section(title, items, empty) {
  return `<section><h2>${esc(title)}</h2>${items.length ? `<div class="desk-grid">${items.map(card).join("")}</div>` : `<div class="notice">${esc(empty)}</div>`}</section>`;
}
function render(data) {
  const g = data.groups || {};
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>LyDia Research Desk | MLB market intelligence</title>
<meta name="description" content="Recent public MLB betting coverage classified by explicit agreement, disagreement, market context, and items that cannot be classified confidently.">
<meta name="robots" content="noindex">
<link rel="canonical" href="${SITE}/articles/"><link rel="stylesheet" href="/css/style.css">
<style>.desk-grid{display:grid;gap:14px;margin:14px 0 28px}.desk-card h3{font-size:1.08rem;margin:10px 0}.source-row{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.takeaway{margin-top:12px;padding:12px 14px;border-left:3px solid var(--accent2);background:var(--bg-elev);border-radius:6px}.takeaway p{margin:4px 0 0;line-height:1.55}</style>
</head><body><nav id="nav"></nav><main>
<p class="eyebrow">Market intelligence</p><h1>LyDia Research Desk</h1>
<p class="subtitle">Recent public MLB coverage separated by explicit side agreement, explicit disagreement, general market context, and headlines that cannot be classified confidently.</p>
<div class="notice"><strong>Classification rule:</strong> A post only counts as agreement or disagreement when the source explicitly identifies a side. A matched matchup alone is not agreement. Outside posts never create, change, or override LyDia's official picks.</div>
<div class="kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0">
<div class="card"><div class="dim small">AGREEMENT</div><div style="font-size:1.5rem;font-weight:800">${g.lydia_agrees?.length || 0}</div></div>
<div class="card"><div class="dim small">DISAGREEMENT</div><div style="font-size:1.5rem;font-weight:800">${g.lydia_disagrees?.length || 0}</div></div>
<div class="card"><div class="dim small">MARKET CONTEXT</div><div style="font-size:1.5rem;font-weight:800">${g.market_context?.length || 0}</div></div>
<div class="card"><div class="dim small">UNCLASSIFIED</div><div style="font-size:1.5rem;font-weight:800">${g.unable_to_classify?.length || 0}</div></div>
</div>
${section("Where LyDia agrees", g.lydia_agrees || [], "No source explicitly selected the same side as LyDia.")}
${section("Where LyDia disagrees", g.lydia_disagrees || [], "No source explicitly selected the opposite side.")}
${section("Market-moving context", g.market_context || [], "No additional market context was available.")}
${section("Unable to classify", g.unable_to_classify || [], "Every matched item had a clear side classification.")}
<p class="dim small">Last refreshed ${esc(data.generated_at)}${data.stale_reuse ? " (no new MLB items cleared review today — showing the last successful refresh)" : ""}. External publishers remain responsible for their own reporting and opinions.</p>
<div class="lead-box" style="margin-top:16px"><h3 style="margin:0 0 4px">Get tomorrow\'s MLB model card free</h3><p class="dim small" style="margin:0">One email, every morning. No payment required.</p><form name="newsletter" method="POST" data-netlify="true" netlify-honeypot="bot-field" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><p style="display:none"><input name="bot-field"></p><input type="hidden" name="form-name" value="newsletter"><input type="email" name="email" required placeholder="you@example.com" style="flex:1;min-width:200px"><button type="submit" class="secondary">Subscribe free</button></form></div>
</main><footer id="footer"></footer><script src="/js/app.js"></script><script>renderNav("/articles/");renderFooter();</script></body></html>`;
}
async function main() {
  const brief = currentBrief();
  const fetched = [];
  const warnings = [];

  for (const q of QUERIES) {
    try { fetched.push(...parse(await fetchText(rssUrl(q)))); }
    catch (e) { warnings.push(`${q}: ${e.message}`); }
  }

  let items = dedupe(fetched.filter(allowed)).map(item => {
    const c = classify(item, brief);
    const d = new Date(item.published_at);
    return {
      ...item,
      source: item.source || "External source",
      published_at: Number.isNaN(d.getTime()) ? null : d.toISOString(),
      published_label: Number.isNaN(d.getTime()) ? "Recent" : d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric", timeZone:"America/New_York" }),
      section: c.section,
      classification_confidence: c.confidence,
      game: c.game,
      selected_side: c.selected_side,
      lydia_takeaway: c.takeaway
    };
  }).sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || ""))).slice(0, MAX_ITEMS);

  let staleReuse = false;
  let reusedGeneratedAt = null;
  if (!items.length) {
    const prior = readJson("data/research-desk.json");
    if (prior && Array.isArray(prior.items)) {
      items = prior.items;
      staleReuse = true;
      reusedGeneratedAt = prior.generated_at || null;
      warnings.push("No new items cleared the MLB-source filter today; showing the last successful refresh instead of a false-fresh timestamp.");
    }
  }

  const groups = {
    lydia_agrees: items.filter(i => i.section === "lydia_agrees"),
    lydia_disagrees: items.filter(i => i.section === "lydia_disagrees"),
    market_context: items.filter(i => i.section === "market_context"),
    unable_to_classify: items.filter(i => i.section === "unable_to_classify")
  };

  const out = {
    date: etToday(),
    // Honest freshness: only stamp "now" when this run actually produced new
    // items. A reused day keeps the ORIGINAL generated_at so the page never
    // claims to be more current than it is.
    generated_at: staleReuse ? (reusedGeneratedAt || new Date().toISOString()) : new Date().toISOString(),
    stale_reuse: staleReuse,
    mode: "explicit-side-classification-v3",
    note: "Agreement and disagreement require an explicitly extracted side. A matchup match alone is never enough.",
    warnings,
    items,
    groups
  };

  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "articles"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "data", "research-desk.json"), JSON.stringify(out, null, 2) + "\n");
  fs.writeFileSync(path.join(ROOT, "articles", "index.html"), render(out));
  console.log(`Research Desk refreshed. Agreement: ${groups.lydia_agrees.length}, disagreement: ${groups.lydia_disagrees.length}, context: ${groups.market_context.length}, unclassified: ${groups.unable_to_classify.length}.`);
}
main().catch(e => { console.error(e); process.exit(1); });
