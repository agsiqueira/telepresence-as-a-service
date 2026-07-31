import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const current = readFileSync("app/api/trips/current/route.ts", "utf8"), history = readFileSync("app/api/trips/history/route.ts", "utf8"), lifecycle = readFileSync("lib/trip-lifecycle.ts", "utf8");
for (const route of [current, history]) assert.match(route, /authorizeExplorerApi/);
assert.match(current, /hasTeleporterCapability/); assert.match(history, /authorizeTeleporterActivityApi/);
assert.match(lifecycle, /trip\.viewerId === actorId \|\| trip\.operatorId === actorId/);
assert.doesNotMatch(lifecycle, /if \(role === Role\.(VIEWER|OPERATOR)\)/);
console.log("Phase 5E.2A legacy-role compatibility and capability handling assertions passed.");
