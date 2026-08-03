import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync("components/SimulatedTipPanel.tsx", "utf8");
const operator = readFileSync("app/operator/page.tsx", "utf8");
const route = readFileSync("app/api/trips/[id]/simulated-tip/route.ts", "utf8");

assert.match(operator, /<JourneyReviewPanel tripId=\{item\.trip\.id\}/, "completed Teleporter Journeys must keep mounting the existing review/tip panel");
assert.match(panel, /createResilientPoller/);
assert.match(panel, /state\?\.performedRole!=="TELEPORTER"\|\|state\.simulatedTip/,
  "only a Teleporter waiting for a receipt should poll");
assert.match(panel, /fetch\(`\/api\/trips\/\$\{tripId\}\/simulated-tip`,\{cache:"no-store",signal\}\)/,
  "polling must reuse the authorized no-store GET endpoint and support cancellation");
assert.match(panel, /if\(next\.simulatedTip\)[\s\S]*return "stop"/,
  "receipt discovery must update state and stop polling");
assert.match(panel, /intervalMs:2000,maxIntervalMs:16000/,
  "receipt retrieval must use the established resilient polling cadence and backoff convention");
assert.match(route, /return send\(await getSimulatedTipState\(db,access\.user\.id,params\.id\)\)/,
  "the existing authorization and response contract must remain in use");

console.log("Simulated Tip Teleporter polling regression validation passed: 7/7");
