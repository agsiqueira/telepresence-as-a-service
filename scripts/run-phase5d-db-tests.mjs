import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const requiredConfirmation = "YES_DELETE_PHASE5D_TEST_DATA";
if (!process.env.PHASE5D_TEST_DATABASE_URL) refuse("PHASE5D_TEST_DATABASE_URL is required; refusing to contact a database.");
if (process.env.PHASE5D_CONFIRM_DISPOSABLE_DATABASE !== requiredConfirmation) refuse("Explicit disposable-database confirmation is required; refusing to connect.");
if (!process.env.PHASE5D_EXPECTED_DATABASE_FINGERPRINT || process.env.PHASE5D_EXPECTED_DATABASE_FINGERPRINT.length < 16 || process.env.PHASE5D_EXPECTED_DATABASE_FINGERPRINT.length > 128) refuse("A separate expected database fingerprint is required; refusing to connect.");
for (const name of ["DATABASE_URL", "PRODUCTION_DATABASE_URL", "SHARED_DATABASE_URL", "DEVELOPMENT_DATABASE_URL", "NEON_DATABASE_URL"]) {
  if (process.env[name] && process.env[name] === process.env.PHASE5D_TEST_DATABASE_URL) refuse(`The disposable URL matches ${name}; refusing to connect.`);
}

function refuse(message) { console.error(message); process.exit(2); }
function run(command, args, env) { return spawnSync(command, args, { env, stdio: "inherit" }).status ?? 1; }
function schemaUrl(raw, schema) { const parsed = new URL(raw); parsed.searchParams.set("schema", schema); return parsed.toString(); }

const baseEnv = { ...process.env, DATABASE_URL: process.env.PHASE5D_TEST_DATABASE_URL };
const compileStatus = run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], baseEnv);
if (compileStatus !== 0) { rmSync(".phase3-test-build", { recursive: true, force: true }); process.exit(compileStatus); }

const preflightStatus = run(process.execPath, [".phase3-test-build/scripts/phase5d-db-preflight.js"], baseEnv);
if (preflightStatus !== 0) { rmSync(".phase3-test-build", { recursive: true, force: true }); process.exit(preflightStatus); }

const fullUrl = schemaUrl(process.env.PHASE5D_TEST_DATABASE_URL, "phase5d_full_validation");
const incrementalUrl = schemaUrl(process.env.PHASE5D_TEST_DATABASE_URL, "phase5d_incremental_validation");
const fullEnv = { ...baseEnv, DATABASE_URL: fullUrl, PHASE5D_ACTIVE_SCHEMA: "FULL" };
const incrementalEnv = { ...baseEnv, DATABASE_URL: incrementalUrl };
const work = mkdtempSync(join(tmpdir(), "phase5d-migrations-"));
let result = 0;

try {
  result = run(process.execPath, [".phase3-test-build/scripts/phase5d-schema-control.js"], { ...baseEnv, PHASE5D_SCHEMA_ACTION: "setup" });
  if (result !== 0) throw new Error("schema setup failed");

  const pre5d = join(work, "pre5d");
  mkdirSync(join(pre5d, "migrations"), { recursive: true });
  cpSync("prisma/schema.prisma", join(pre5d, "schema.prisma"));
  cpSync("prisma/migrations/migration_lock.toml", join(pre5d, "migrations", "migration_lock.toml"));
  for (const migration of readdirSync("prisma/migrations", { withFileTypes: true })) {
    if (migration.isDirectory() && migration.name < "20260728200000_phase5d_operator_applications") cpSync(join("prisma/migrations", migration.name), join(pre5d, "migrations", migration.name), { recursive: true });
  }

  result = run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", join(pre5d, "schema.prisma")], incrementalEnv);
  if (result !== 0) throw new Error("pre-5D migration deployment failed");
  result = run(process.execPath, [".phase3-test-build/scripts/phase5d-incremental-fixture.js"], { ...incrementalEnv, PHASE5D_MIGRATION_STAGE: "PRE_5D" });
  if (result !== 0) throw new Error("pre-5D fixture creation failed");
  result = run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"], incrementalEnv);
  if (result !== 0) throw new Error("incremental Phase 5D migration failed");
  result = run(process.execPath, [".phase3-test-build/scripts/phase5d-incremental-verify.js"], { ...incrementalEnv, PHASE5D_MIGRATION_STAGE: "POST_5D" });
  if (result !== 0) throw new Error("incremental Phase 5D verification failed");

  result = run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"], fullEnv);
  if (result !== 0) throw new Error("full migration-history deployment failed");
  result = run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"], fullEnv);
  if (result !== 0) throw new Error("deployed schema differs from schema.prisma");
  result = run(process.execPath, [".phase3-test-build/scripts/phase5d-db-integration.js"], fullEnv);
  if (result !== 0) throw new Error("Phase 5D schema integration assertions failed");
  result = run(process.execPath, ["--conditions=react-server", ".phase3-test-build/scripts/phase5d-service-db-integration.js"], fullEnv);
  if (result !== 0) throw new Error("Phase 5D service workflow integration assertions failed");
} catch (error) {
  if (result === 0) result = 1;
  console.error(error instanceof Error ? error.message : "Phase 5D disposable validation failed");
} finally {
  const cleanupStatus = run(process.execPath, [".phase3-test-build/scripts/phase5d-schema-control.js"], { ...baseEnv, PHASE5D_SCHEMA_ACTION: "cleanup" });
  rmSync(work, { recursive: true, force: true });
  rmSync(".phase3-test-build", { recursive: true, force: true });
  if (cleanupStatus !== 0) result = cleanupStatus;
}

process.exit(result);
