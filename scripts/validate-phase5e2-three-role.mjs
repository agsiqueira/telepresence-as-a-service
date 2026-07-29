import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const current = readFileSync("app/api/trips/current/route.ts", "utf8"), history = readFileSync("app/api/trips/history/route.ts", "utf8"), lifecycle = readFileSync("lib/trip-lifecycle.ts", "utf8");
for (const route of [current, history]) { assert.match(route, /user\.role !== Role\.VIEWER && user\.role !== Role\.OPERATOR/); assert.match(route, /status: 403/); }
assert.match(lifecycle, /if \(role === Role\.VIEWER\)/); assert.match(lifecycle, /if \(role === Role\.OPERATOR\)/); assert.match(lifecycle, /return false/); assert.doesNotMatch(lifecycle, /role === Role\.VIEWER\s*\?[\s\S]*:\s*trip\.operatorId/);
console.log("Phase 5E.2A explicit three-role handling assertions passed.");
