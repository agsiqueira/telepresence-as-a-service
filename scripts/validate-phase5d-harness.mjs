import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const runner = readFileSync("scripts/run-phase5d-db-tests.mjs", "utf8");
const preflight = readFileSync("scripts/phase5d-db-preflight.ts", "utf8");
const schemaControl = readFileSync("scripts/phase5d-schema-control.ts", "utf8");
const fixture = readFileSync("scripts/phase5d-incremental-fixture.ts", "utf8");
const verify = readFileSync("scripts/phase5d-incremental-verify.ts", "utf8");
const integration = readFileSync("scripts/phase5d-db-integration.ts", "utf8");

for (const pattern of [/PHASE5D_TEST_DATABASE_URL/, /YES_DELETE_PHASE5D_TEST_DATA/, /PHASE5D_EXPECTED_DATABASE_FINGERPRINT/, /process\.env\[name] === process\.env\.PHASE5D_TEST_DATABASE_URL/]) assert.match(runner, pattern);
assert.ok(runner.indexOf("phase5d-db-preflight.js") < runner.indexOf('"migrate", "deploy"'));
assert.ok(runner.indexOf("phase5d-db-preflight.js") < runner.indexOf("PHASE5D_SCHEMA_ACTION: \"setup\""));
assert.ok(runner.indexOf("phase5d-db-preflight.js") < runner.indexOf("phase5d-db-integration.js"));
assert.match(preflight, /shobj_description\(oid, 'pg_database'\)/);
assert.match(preflight, /rows\[0\]\.fingerprint !== expected/);
assert.doesNotMatch(preflight, /console\.(?:log|error)\([^)]*(?:DATABASE_URL|connection|stringify)/);
assert.match(runner, /20260728200000_phase5d_operator_applications/);
assert.match(runner, /phase5d-incremental-fixture\.js/);
assert.match(runner, /phase5d-incremental-verify\.js/);
assert.match(runner, /migrate", "diff"/);
assert.match(runner, /--exit-code/);
assert.match(runner, /finally/);
assert.match(runner, /PHASE5D_SCHEMA_ACTION: "cleanup"/);
assert.match(schemaControl, /DROP SCHEMA IF EXISTS/);
assert.match(schemaControl, /Phase 5D cleanup verification failed/);
assert.match(fixture, /Role\.VIEWER/);
assert.match(fixture, /Role\.OPERATOR/);
assert.match(fixture, /Role\.ADMIN/);
assert.match(verify, /OperatorApplication_one_pending_per_applicant/);
assert.match(verify, /delete_action === "r"/);
assert.match(integration, /Promise\.allSettled/);
assert.match(integration, /terminal history must allow repeated statuses/);
assert.match(integration, /assert\.rejects\(db\.user\.delete/);

const baseEnv = { ...process.env };
for (const key of ["PHASE5D_TEST_DATABASE_URL", "PHASE5D_CONFIRM_DISPOSABLE_DATABASE", "PHASE5D_EXPECTED_DATABASE_FINGERPRINT"]) delete baseEnv[key];
let refusal = spawnSync(process.execPath, ["scripts/run-phase5d-db-tests.mjs"], { env: baseEnv, encoding: "utf8" });
assert.equal(refusal.status, 2);

const sentinel = "postgresql://not-used.invalid/disposable";
refusal = spawnSync(process.execPath, ["scripts/run-phase5d-db-tests.mjs"], {
  env: {
    ...baseEnv,
    DATABASE_URL: sentinel,
    PHASE5D_TEST_DATABASE_URL: sentinel,
    PHASE5D_CONFIRM_DISPOSABLE_DATABASE: "YES_DELETE_PHASE5D_TEST_DATA",
    PHASE5D_EXPECTED_DATABASE_FINGERPRINT: "phase5d-disposable-fingerprint",
  },
  encoding: "utf8",
});
assert.equal(refusal.status, 2, "a URL matching DATABASE_URL must be refused before compilation or connection");

console.log("Phase 5D.1 disposable database harness safety assertions passed without a database connection.");
