#!/usr/bin/env node
/*
  LyDia public shell and language normalizer.

  Purpose:
  - Fix existing static/generated HTML pages that still contain old hardcoded nav/footer markup.
  - Enforce js/app.js as the single source of truth for nav and footer.
  - Remove public-facing internal implementation language from old generated pages.
  - Keep future site maintenance from leaving historical pages with missing tabs.

  This does not change picks, results, forms, analytics, or data.
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
    console.log(`normalized public shell/text: ${rel}`);
    changed++;
  }
}

console.log(`Public normalization complete. Checked ${files.length} HTML file(s). Changed ${changed}.`);

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

  out = normalizeNav(out);
  out = normalizeFooter(out);
  out = normalizeAppScript(out, active);
  out = sanitizePublicLanguage(out);

  // Clean up accidental whitespace caused by replacement.
  out = out.replace(/<footer id="footer"><\/footer>\s*<script src="\/js\/app\.js"><\/script>/i, '<footer id="footer"></footer><script src="/js/app.js"></script>');
  return out;
}

function normalizeNav(html) {
  if (/<nav\b[\s\S]*?<\/nav>/i.test(html)) {
    return html.replace(/<nav\b[\s\S]*?<\/nav>/i, '<nav id="nav"></nav>');
  }
  return html.replace(/<body([^>]*)>/i, '<body$1>\n<nav id="nav"></nav>');
}

function normalizeFooter(html) {
  if (/<footer\b[\s\S]*?<\/footer>/i.test(html)) {
    return html.replace(/<footer\b[\s\S]*?<\/footer>/i, '<footer id="footer"></footer>');
  }
  return html.replace(/<\/body>/i, '<footer id="footer"></footer>\n</body>');
}

function normalizeAppScript(html, active) {
  let out = html;

  // Remove old one-line render calls so the active path can be set correctly once.
  out = out.replace(/<script>\s*renderNav\(["'][^"']*["']\);\s*renderFooter\(\);\s*<\/script>/g, "");

  // Add the shared app script if missing.
  if (!/src=["']\/js\/app\.js["']/i.test(out)) {
    out = out.replace(/<\/body>/i, '<script src="/js/app.js"></script>\n</body>');
  }

  const renderCall = `<script>renderNav("${active}"); renderFooter();</script>`;
  if (/renderNav\(["'][^"']*["']\);\s*renderFooter\(\);/i.test(out)) {
    out = out.replace(/renderNav\(["'][^"']*["']\);\s*renderFooter\(\);/i, `renderNav("${active}"); renderFooter();`);
  } else {
    out = out.replace(/(<script\s+src=["']\/js\/app\.js["']><\/script>)/i, `$1${renderCall}`);
  }
  return out;
}

function sanitizePublicLanguage(html) {
  let out = html;

  // Remove internal script paths from public pages.
  out = out.replace(/<code>node\s+scripts\/generate-[^<]+<\/code>/gi, "the daily workflow");
  out = out.replace(/scripts\/generate-[a-z0-9_.-]+\.js/gi, "LyDia daily engine");
  out = out.replace(/source_of_truth/gi, "daily_source");
  out = out.replace(/source-of-truth/gi, "daily");

  // Replace raw ISO timestamps in old generated pages with public wording.
  out = out.replace(/Generated\s+20\d{2}-\d{2}-\d{2}T[0-9:.]+Z\s*·\s*/g, "Updated by LyDia · ");
  out = out.replace(/Generated:\s*20\d{2}-\d{2}-\d{2}T[0-9:.]+Z/gi, "Updated by LyDia");
  out = out.replace(/Generated\s+20\d{2}-\d{2}-\d{2}T[0-9:.]+Z/gi, "Updated by LyDia");

  // Replace internal source labels with public language.
  out = out.replace(/Official record source:\s*<code>[^<]+<\/code>\.?/gi, "Official card record is locked before first pitch.");
  out = out.replace(/<strong>Source:<\/strong>\s*generated bullpen file\s*<code>[^<]+<\/code>/gi, "<strong>Bullpen data loaded.</strong>");
  out = out.replace(/<strong>Source:<\/strong>\s*[^<]*LyDia daily engine[^<]*/gi, "<strong>LyDia Daily Engine</strong>");


  // Avoid dynamic raw timestamps in public tool status messages.
  out = out.replace(/<br><span class="small dim">Version:\s*\$\{esc\(data\.version[\s\S]*?Generated:\s*\$\{esc\(data\.generated_at[\s\S]*?<\/span>/gi, '<br><span class="small dim">Updated from the latest daily bullpen run.</span>');

  // Make tool fallback instructions user-facing instead of developer-facing.
  out = out.replace(/Run the daily content workflow or\s*the daily workflow\s*to generate\s*<code>\/data\/bullpen\/\$\{esc\(date\)\}\.json<\/code>\./gi, "Run the daily publish workflow before opening this date.");
  out = out.replace(/Run the daily workflow or\s*the daily workflow\s*before opening this tool\./gi, "Run the daily publish workflow before opening this tool.");

  return out;
}
