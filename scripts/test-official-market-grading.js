#!/usr/bin/env node
"use strict";

const assert = require("assert");
const amToDec = am => am > 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am);
const gradeTotal = (pick, line, total) => total === line ? "PUSH" : ((pick === "Over" ? total > line : total < line) ? "W" : "L");
const gradeK = (pick, line, actual) => actual === null ? "VOID" : actual === line ? "PUSH" : ((pick === "Over" ? actual > line : actual < line) ? "W" : "L");

assert.equal(gradeTotal("Over", 8.5, 10), "W");
assert.equal(gradeTotal("Under", 8.5, 10), "L");
assert.equal(gradeTotal("Over", 9, 9), "PUSH");
assert.equal(gradeK("Over", 5.5, 7), "W");
assert.equal(gradeK("Under", 5.5, 7), "L");
assert.equal(gradeK("Under", 6, 6), "PUSH");
assert.equal(gradeK("Over", 5.5, null), "VOID");
assert.equal(Number((amToDec(-110) - 1).toFixed(4)), 0.9091);
assert.equal(Number((amToDec(125) - 1).toFixed(2)), 1.25);

// Team markets do not depend on the originally listed opener.
const teamMarketResult = ({ pickedHome, awayScore, homeScore }) => (pickedHome === (homeScore > awayScore) ? "W" : "L");
assert.equal(teamMarketResult({ pickedHome: true, awayScore: 3, homeScore: 5, listedStarterChanged: true }), "W");

console.log("Official-market grading tests passed.");
