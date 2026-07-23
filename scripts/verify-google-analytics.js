#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GA_ID = "G-XVWTMDNBJK";
const SKIP_DIRS = new Set([".git", "node_modules", ".netlify", "dist", "build", "gym"]);
const missing = [];
let checked = 0;

walk(ROOT);

if (missing.length) {
  throw new Error(
    `Google Analytics tag ${GA_ID} is missing from ${missing.length} public HTML file(s):\n` +
    missing.map(file => `- ${file}`).join("\n")
  );
}

console.log(`Google Analytics verification passed: ${checked} public HTML files contain ${GA_ID}.`);

function walk(target) {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(target))) return;
    for (const entry of fs.readdirSync(target)) walk(path.join(target, entry));
    return;
  }
  if (!target.endsWith(".html")) return;
  checked++;
  const html = fs.readFileSync(target, "utf8");
  if (!html.includes(GA_ID) || !html.includes("googletagmanager.com/gtag/js")) {
    missing.push(path.relative(ROOT, target).replace(/\\/g, "/"));
  }
}
