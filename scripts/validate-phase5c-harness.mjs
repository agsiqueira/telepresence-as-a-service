import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const runner = readFileSync("scripts/run-phase5c-db-tests.mjs", "utf8");
const preflight = readFileSync("scripts/phase5c-db-preflight.ts", "utf8");
const integration = readFileSync("scripts/phase5c-db-integration.ts", "utf8");
const schemaControl = readFileSync("scripts/phase5c-schema-control.ts", "utf8");
const incrementalFixture = readFileSync("scripts/phase5c-incremental-fixture.ts", "utf8");
const incrementalVerify = readFileSync("scripts/phase5c-incremental-verify.ts", "utf8");

assert.match(runner, /PHASE5C_CONFIRM_DISPOSABLE_DATABASE/);
assert.match(runner, /YES_DELETE_PHASE5C_TEST_DATA/);
assert.match(runner, /PHASE5C_EXPECTED_DATABASE_FINGERPRINT/);
assert.match(runner, /process\.env\[name\] === process\.env\.PHASE5C_TEST_DATABASE_URL/);
assert.ok(runner.indexOf("phase5c-db-preflight.js") < runner.indexOf('"migrate", "deploy"'));
assert.ok(runner.indexOf("phase5c-db-preflight.js") < runner.indexOf("phase5c-db-integration.js"));
assert.ok(runner.indexOf("phase5c-db-preflight.js") < runner.indexOf("PHASE5C_SCHEMA_ACTION: \"setup\""));
for (const module of ["marketplace", "phase3-services", "trip-lifecycle", "role-transitions"]) assert.match(runner, new RegExp(`\\"${module}\\"`));
assert.match(runner, /replace\('\s*require\("server-only"\);'/);
assert.match(preflight, /obj_description\(oid, 'pg_database'\)/);
assert.match(preflight, /rows\[0\]\.fingerprint !== expected/);
assert.doesNotMatch(preflight, /console\.(?:log|error)\([^)]*(?:DATABASE_URL|connection|stringify)/);
assert.match(integration, /assignViewerAsOperator[\s\S]*createTripRequest/);
assert.match(integration, /PrismaClientKnownRequestError[\s\S]*error\.code === "P2034"/);
assert.match(integration, /attempt >= 3/);
assert.match(integration, /promotion\.ok && creation\.ok/);
assert.match(integration, /role === Role\.OPERATOR && unfinished > 0/);
for (const pattern of [
  /new-profile/, /dormant/, /OperatorPilotStatus\.PENDING/, /OperatorPilotStatus\.SUSPENDED/,
  /TripStatus\.REQUESTED/, /TripStatus\.OFFERED/, /TripStatus\.ACCEPTED/, /TripStatus\.IN_PROGRESS/, /TripStatus\.ENDED/,
  /TripStatus\.FEEDBACK_COMPLETED/, /TripStatus\.CANCELLED/, /TripStatus\.NO_OPERATOR_AVAILABLE/,
  /OfferStatus\.OFFERED/, /OfferStatus\.ACCEPTED/, /OfferStatus\.DECLINED/, /OfferStatus\.EXPIRED/,
  /destination-cleanup/, /assignment-race/, /acceptance-race/, /phase5c_force_audit_failure/,
  /assert\.rejects\(db\.user\.delete/,
]) assert.match(integration, pattern);
assert.doesNotMatch(integration, /Pending expansion|TODO|planned-but-not-yet-executable/i);
assert.match(runner, /phase5c-incremental-fixture\.js/);
assert.match(runner, /phase5c-incremental-verify\.js/);
assert.match(runner, /migrate", "diff"/);
assert.match(runner, /--exit-code/);
assert.match(runner, /finally/);
assert.match(runner, /PHASE5C_SCHEMA_ACTION: "cleanup"/);
assert.match(schemaControl, /DROP SCHEMA IF EXISTS/);
assert.match(schemaControl, /Phase 5C cleanup verification failed/);
assert.match(incrementalFixture, /Role\.VIEWER/); assert.match(incrementalFixture, /Role\.OPERATOR/); assert.match(incrementalFixture, /Role\.ADMIN/);
assert.match(incrementalVerify, /AdminRoleChangeAudit_targetId_createdAt_idx/);
assert.match(incrementalVerify, /AdminRoleChangeAudit_actorId_createdAt_idx/);
assert.match(incrementalVerify, /delete_action === "r"/);

const baseEnv = { ...process.env };
for (const key of ["PHASE5C_TEST_DATABASE_URL", "PHASE5C_CONFIRM_DISPOSABLE_DATABASE", "PHASE5C_EXPECTED_DATABASE_FINGERPRINT"]) delete baseEnv[key];
let refusal = spawnSync(process.execPath, ["scripts/run-phase5c-db-tests.mjs"], { env: baseEnv, encoding: "utf8" });
assert.equal(refusal.status, 2);

const sentinel = "postgresql://not-used.invalid/disposable";
refusal = spawnSync(process.execPath, ["scripts/run-phase5c-db-tests.mjs"], {
  env: {
    ...baseEnv,
    DATABASE_URL: sentinel,
    PHASE5C_TEST_DATABASE_URL: sentinel,
    PHASE5C_CONFIRM_DISPOSABLE_DATABASE: "YES_DELETE_PHASE5C_TEST_DATA",
    PHASE5C_EXPECTED_DATABASE_FINGERPRINT: "phase5c-disposable-fingerprint",
  },
  encoding: "utf8",
});
assert.equal(refusal.status, 2, "a URL matching DATABASE_URL must be refused before compilation or connection");

console.log("Phase 5C disposable database harness safety assertions passed without a database connection.");
