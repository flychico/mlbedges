#!/usr/bin/env node
/*
  LyDia public shell normalizer.

  Purpose:
  - Fix existing static/generated HTML pages that still contain old hardcoded nav/footer markup.
  - Enforce js/app.js as the single source of truth for nav and footer.
  - Keep future site maintenance from leaving historical pages with missing tabs.

  This does not change page content, picks, results, forms, analytics, or data.
*/
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set([".git", "node_modules", ".netlify", "dist", "build"]);
const ROOTS = [
  ".",
  "dashboard",
  "picks",
  "previews",
  "results",
  "odds",
  "tools",
  "stats",
  "recaps",
  "articles",
  "membership",
  "member-brief",
  "mlb-betting-edge-explained",
  "no-vig-odds-calculator-guide",
  "how-to-find-value-in-mlb-moneylines",
  "closing-line-value-mlb-betting",
  "mlb-run-line-vs-moneyline",
  "mlb-bullpen-fatigue-betting",
  "mlb-park-factors-betting-guide",
  "mlb-pitching-metrics-for-betting"
];

const files = [];
for (const root of ROOTS) collect(path.join(ROOT, root));

let changed = 0;
for (const file of [...new Set(files)]) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const before = fs.readFileSync(file, "utf8");
  const after = normalizeHtml(before, rel);
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    console.log(`normalized shell: ${rel}`);
    changed++;
  }
}

console.log(`Public shell normalization complete. Checked ${files.length} HTML file(s). Changed ${changed}.`);

function collect(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (target.endsWith(".html")) files.push(target);
    return;
  }
  const base = path.basename(target);
  if (SKIP_DIRS.has(base)) return;
  for (const item of fs.readdirSync(target)) collect(path.join(target, item));
}

function activeFor(rel) {
  if (rel === "index.html") return "/";
  const first = rel.split("/")[0];
  const map = {
    dashboard: "/dashboard/",
    picks: "/picks/",
    previews: "/previews/",
    results: "/results/",
    odds: "/odds/",
    tools: "/tools/",
    stats: "/stats/",
    recaps: "/recaps/",
    articles: "/articles/",
    membership: "/membership/",
    "member-brief": "/member-brief/"
  };
  return map[first] || "/articles/";
}

function normalizeHtml(html, rel) {
  if (!/<html[\s>]/i.test(html)) return html;
  const active = activeFor(rel);
  let out = html;

  // Normalize the first navigation block. Old generated pages hardcoded a smaller nav.
  if (/<nav\b[\s\S]*?<\/nav>/i.test(out)) {
    out = out.replace(/<nav\b[\s\S]*?<\/nav>/i, '<nav id="nav"></nav>');
  } else {
    out = out.replace(/<body([^>]*)>/i, '<body$1>\n<nav id="nav"></nav>');
  }

  // Normalize the first footer block so footer text also has one source of truth.
  if (/<footer\b[\s\S]*?<\/footer>/i.test(out)) {
    out = out.replace(/<footer\b[\s\S]*?<\/footer>/i, '<footer id="footer"></footer>');
  } else {
    out = out.replace(/<\/body>/i, '<footer id="footer"></footer>\n</body>');
  }

  // Remove old one-line render calls so the active path can be set correctly once.
  out = out.replace(/<script>\s*renderNav\(["'][^"']*["']\);\s*renderFooter\(\);\s*<\/script>/g, "");

  // Add the shared app script if missing.
  if (!/src=["']\/js\/app\.js["']/i.test(out)) {
    out = out.replace(/<\/body>/i, '<script src="/js/app.js"></script>\n</body>');
  }

  // Add or correct the render call. Keep page-specific scripts untouched.
  const renderCall = `<script>renderNav("${active}"); renderFooter();</script>`;
  if (/renderNav\(["'][^"']*["']\);\s*renderFooter\(\);/i.test(out)) {
    out = out.replace(/renderNav\(["'][^"']*["']\);\s*renderFooter\(\);/i, `renderNav("${active}"); renderFooter();`);
  } else {
    out = out.replace(/(<script\s+src=["']\/js\/app\.js["']><\/script>)/i, `$1${renderCall}`);
  }

  // Clean up accidental whitespace caused by replacement.
  out = out.replace(/<footer id="footer"><\/footer>\s*<script src="\/js\/app\.js"><\/script>/i, '<footer id="footer"></footer><script src="/js/app.js"></script>');
  return out;
}
