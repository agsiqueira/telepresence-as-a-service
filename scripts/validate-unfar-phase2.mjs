import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { AccountStatus, JourneyRequestStatus, Role } from "@prisma/client";

const schema = readFileSync("prisma/schema.prisma", "utf8"), migration = readFileSync("prisma/migrations/20260731170000_phase2_journey_requests/migration.sql", "utf8"), serviceSource = readFileSync("lib/journey-requests.ts", "utf8");
assert.match(schema, /enum JourneyRequestStatus \{\s+OPEN\s+WITHDRAWN\s+EXPIRED\s+CONVERTED/);
for (const field of ["explorerId", "publicPlaceName", "coarseLocation", "privateMeetingDetails", "earliestStart", "latestStart", "durationMinutes", "proposedPriceMinor", "currency", "expiresAt", "createdAt", "updatedAt"]) assert.match(schema, new RegExp(`\\b${field}\\b`));
for (const check of ["JourneyRequest_window_check", "JourneyRequest_duration_check", "JourneyRequest_price_check", "JourneyRequest_currency_check", "JourneyRequest_expiration_check", "JourneyRequest_lifecycle_check"]) assert.match(migration, new RegExp(check));
assert.doesNotMatch(schema, /model (Review|GuidedExperience|LiveMoment)\b/);
assert.doesNotMatch(serviceSource.match(/DISCOVERY_SELECT = \{[\s\S]*?\} satisfies/)?.[0] ?? "", /privateMeetingDetails|explorerId/);
assert.match(serviceSource, /status: JourneyRequestStatus\.OPEN, expiresAt: \{ gt: now \}/);

const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const build = ".phase3-test-build/lib/journey-requests.js";
writeFileSync(build, readFileSync(build, "utf8").replace('require("server-only");', ""));
mkdirSync(".phase3-test-build/node_modules/@/lib", { recursive: true });
writeFileSync(".phase3-test-build/node_modules/@/lib/safety-restriction-lock.js", "exports.acquireSafetyRestrictionParticipantLocks=async()=>[];exports.hasEffectiveSafetyRestrictionInTransaction=async()=>false;\n");
const { createJourneyRequest, discoverOpenJourneyRequests, getOwnedJourneyRequest, listOwnedJourneyRequests, validateJourneyRequestInput, withdrawJourneyRequest } = await import(`../${build}`);

const now = new Date("2026-08-01T12:00:00Z"), earliest = new Date("2026-08-02T12:00:00Z"), latest = new Date("2026-08-03T12:00:00Z"), expires = new Date("2026-08-03T00:00:00Z");
const validBody = { publicPlaceName: "Public Garden", coarseLocation: "Boston, MA", privateMeetingDetails: "North gate bench", earliestStart: earliest.toISOString(), latestStart: latest.toISOString(), durationMinutes: 60, proposedPriceMinor: 2500, currency: "usd", expiresAt: expires.toISOString() };
const validated = validateJourneyRequestInput(validBody, now); assert.equal(validated.ok, true); assert.equal(validated.value.currency, "USD");
for (const body of [{ ...validBody, latestStart: earliest.toISOString() }, { ...validBody, durationMinutes: 0 }, { ...validBody, proposedPriceMinor: -1 }, { ...validBody, currency: "ZZZ" }, { ...validBody, expiresAt: new Date(latest.getTime() + 1).toISOString() }]) assert.equal(validateJourneyRequestInput(body, now).ok, false);

function database() {
  const users = new Map([["explorer", { role: Role.VIEWER, accountStatus: AccountStatus.ACTIVE }], ["teleporter", { role: Role.OPERATOR, accountStatus: AccountStatus.ACTIVE }], ["inactive", { role: Role.VIEWER, accountStatus: AccountStatus.DEACTIVATED }]]), rows = [];
  const pick = (row, select) => Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]]));
  const jr = {
    create: async ({ data, select }) => { const row = { id: `request-${rows.length + 1}`, status: JourneyRequestStatus.OPEN, tripId: null, withdrawnAt: null, convertedAt: null, createdAt: now, updatedAt: now, ...data }; rows.push(row); return pick(row, select); },
    updateMany: async ({ where, data }) => { let count = 0; for (const row of rows) { if (where.id && row.id !== where.id) continue; if (where.explorerId && row.explorerId !== where.explorerId) continue; if (where.status && row.status !== where.status) continue; if (where.expiresAt?.lte && row.expiresAt > where.expiresAt.lte) continue; if (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) continue; Object.assign(row, data); count++; } return { count }; },
    findMany: async ({ where = {}, select }) => rows.filter(row => (!where.explorerId || row.explorerId === where.explorerId) && (!where.status || row.status === where.status) && (!where.expiresAt?.gt || row.expiresAt > where.expiresAt.gt)).map(row => pick(row, select)),
    findFirst: async ({ where, select }) => { const row = rows.find(row => (!where.id || row.id === where.id) && (!where.explorerId || row.explorerId === where.explorerId)); return row ? pick(row, select) : null; },
    findUniqueOrThrow: async ({ where, select }) => { const row = rows.find(row => row.id === where.id); assert.ok(row); return pick(row, select); },
  };
  const db = { user: { findUnique: async ({ where }) => users.get(where.id) ?? null }, destination: { count: async () => 1 }, journeyRequest: jr, $transaction: async work => work(db) };
  return { db, rows };
}

const store = database();
let result = await createJourneyRequest(store.db, "explorer", validated.value, now); assert.equal(result.ok, true); assert.equal(result.value.status, JourneyRequestStatus.OPEN); assert.equal(store.rows.length, 1, "unmatched creation only persists durable demand");
result = await createJourneyRequest(store.db, "teleporter", validated.value, now); assert.equal(result.ok, true, "approved/legacy Teleporter participant retains Explorer creation"); assert.equal(store.rows.length, 2);
result = await createJourneyRequest(store.db, "inactive", validated.value, now); assert.equal(result.ok, false);
assert.equal((await listOwnedJourneyRequests(store.db, "explorer", now)).length, 1); assert.ok(await getOwnedJourneyRequest(store.db, "explorer", "request-1", now)); assert.equal(await getOwnedJourneyRequest(store.db, "teleporter", "request-1", now), null);
assert.equal((await withdrawJourneyRequest(store.db, "teleporter", "request-1", now)).ok, false); result = await withdrawJourneyRequest(store.db, "explorer", "request-1", now); assert.equal(result.ok, true); assert.equal(result.value.status, JourneyRequestStatus.WITHDRAWN); result = await withdrawJourneyRequest(store.db, "explorer", "request-1", now); assert.equal(result.ok, true, "repeat withdrawal is idempotent");
store.rows[1].expiresAt = new Date(now.getTime() - 1); const discovery = await discoverOpenJourneyRequests(store.db, now); assert.equal(discovery.length, 0); assert.equal(store.rows[1].status, JourneyRequestStatus.EXPIRED); result = await withdrawJourneyRequest(store.db, "teleporter", "request-2", now); assert.equal(result.ok, false, "expired requests reject withdrawal");

for (const path of ["app/api/journey-requests/route.ts", "app/api/journey-requests/[id]/route.ts", "app/api/journey-requests/[id]/withdraw/route.ts"]) assert.match(readFileSync(path, "utf8"), /authorizeExplorerApi/);
const discoveryRoute = readFileSync("app/api/operator/journey-requests/route.ts", "utf8"); assert.match(discoveryRoute, /authorizeTeleporterActivityApi/); assert.match(discoveryRoute, /evaluateOperatorReadiness/);
assert.match(readFileSync("app/api/admin/journey-requests/route.ts", "utf8"), /authorizeAdminApi/);
assert.doesNotMatch(readFileSync("components/JourneyRequestDiscovery.tsx", "utf8"), /privateMeetingDetails/);
rmSync(".phase3-test-build", { recursive: true, force: true });
console.log("Unfar Phase 2 Journey Request validation passed");
