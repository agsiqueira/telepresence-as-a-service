import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const decisions = read("docs/unfar-phase-0-architecture-decisions.md");
for (const statement of [
  "Every active, non-admin participant has Explorer capability",
  "immutable, versioned proposals",
  "exactly one confirmed Journey",
  "no real payment processing",
  "Claude Design v29",
]) assert.match(decisions, new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

const capabilities = read("lib/capabilities.ts");
assert.match(capabilities, /accountStatus === AccountStatus\.ACTIVE && user\.role !== Role\.ADMIN/);
assert.match(capabilities, /operatorProfile\?\.pilotStatus === OperatorPilotStatus\.APPROVED/);
assert.match(capabilities, /OperatorPilotStatus\.SUSPENDED/);
assert.match(capabilities, /TripStatus\.ACCEPTED \|\| trip\.status === TripStatus\.IN_PROGRESS/);

const explorerRoute = read("app/api/trips/route.ts");
assert.match(explorerRoute, /authorizeExplorerApi\(\)/);
assert.match(explorerRoute, /authorizeTeleporterActivityApi\(\)/);
const marketplace = read("lib/marketplace.ts");
assert.doesNotMatch(marketplace, /role: Role\.OPERATOR/);
assert.match(marketplace, /pilotStatus: OperatorPilotStatus\.APPROVED/);
const current = read("app/api/trips/current/route.ts");
assert.match(current, /as"\) === "teleporter"/);
const layout = read("app/viewer/layout.tsx");
assert.match(layout, /user\.operatorProfile/); assert.match(layout, /hasTeleporterCapability\(user\)/);
assert.match(layout, /href="\/operator"/);

console.log("Unfar Phase 0/1 capability validation passed");
