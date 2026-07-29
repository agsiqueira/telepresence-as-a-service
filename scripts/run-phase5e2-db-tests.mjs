import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const confirmation = "YES_DELETE_PHASE5E2_TEST_DATA";
if (!process.env.PHASE5E2_TEST_DATABASE_URL) refuse("PHASE5E2_TEST_DATABASE_URL is required; refusing to contact a database.");
if (process.env.PHASE5E2_CONFIRM_DISPOSABLE_DATABASE !== confirmation) refuse("Explicit disposable-database confirmation is required; refusing to connect.");
if (!process.env.PHASE5E2_EXPECTED_DATABASE_FINGERPRINT || process.env.PHASE5E2_EXPECTED_DATABASE_FINGERPRINT.length < 16 || process.env.PHASE5E2_EXPECTED_DATABASE_FINGERPRINT.length > 128) refuse("A separate expected database fingerprint is required; refusing to connect.");
for (const name of ["DATABASE_URL", "PRODUCTION_DATABASE_URL", "SHARED_DATABASE_URL", "DEVELOPMENT_DATABASE_URL", "STAGING_DATABASE_URL", "NEON_DATABASE_URL"]) if (process.env[name] && process.env[name] === process.env.PHASE5E2_TEST_DATABASE_URL) refuse(`The disposable URL matches ${name}; refusing to connect.`);
function refuse(message) { console.error(message); process.exit(2); }
function run(command, args, env) { return spawnSync(command, args, { env, stdio: "inherit" }).status ?? 1; }
function schemaUrl(raw, schema) { const parsed = new URL(raw); parsed.searchParams.set("schema", schema); return parsed.toString(); }
const baseEnv = { ...process.env, DATABASE_URL: process.env.PHASE5E2_TEST_DATABASE_URL };
const compiled = run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], baseEnv); if (compiled !== 0) { rmSync(".phase3-test-build", { recursive: true, force: true }); process.exit(compiled); }
const preflight = run(process.execPath, [".phase3-test-build/scripts/phase5e2-db-preflight.js"], baseEnv); if (preflight !== 0) { rmSync(".phase3-test-build", { recursive: true, force: true }); process.exit(preflight); }
const fullEnv = { ...baseEnv, DATABASE_URL: schemaUrl(process.env.PHASE5E2_TEST_DATABASE_URL, "phase5e2_full_validation"), PHASE5E2_ACTIVE_SCHEMA: "FULL" };
const incrementalEnv = { ...baseEnv, DATABASE_URL: schemaUrl(process.env.PHASE5E2_TEST_DATABASE_URL, "phase5e2_incremental_validation") };
const work = mkdtempSync(join(tmpdir(), "phase5e2-migrations-")); let result = 0;
try {
  result = run(process.execPath, [".phase3-test-build/scripts/phase5e2-schema-control.js"], { ...baseEnv, PHASE5E2_SCHEMA_ACTION: "setup" }); if (result !== 0) throw new Error("schema setup failed");
  const pre5e2 = join(work, "pre5e2"); mkdirSync(join(pre5e2, "migrations"), { recursive: true }); cpSync("prisma/schema.prisma", join(pre5e2, "schema.prisma")); cpSync("prisma/migrations/migration_lock.toml", join(pre5e2, "migrations", "migration_lock.toml"));
  for (const migration of readdirSync("prisma/migrations", { withFileTypes: true })) if (migration.isDirectory() && migration.name < "20260729010000_phase5e2a_administrator_governance") cpSync(join("prisma/migrations", migration.name), join(pre5e2, "migrations", migration.name), { recursive: true });
  result = run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", join(pre5e2, "schema.prisma")], incrementalEnv); if (result !== 0) throw new Error("pre-5E.2 migration deployment failed");
  result = run(process.execPath, [".phase3-test-build/scripts/phase5e2-incremental-fixture.js"], { ...incrementalEnv, PHASE5E2_MIGRATION_STAGE: "PRE_5E2" }); if (result !== 0) throw new Error("pre-5E.2 fixture failed");
  result = run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"], incrementalEnv); if (result !== 0) throw new Error("incremental Phase 5E.2 migration failed");
  result = run(process.execPath, [".phase3-test-build/scripts/phase5e2-incremental-verify.js"], { ...incrementalEnv, PHASE5E2_MIGRATION_STAGE: "POST_5E2" }); if (result !== 0) throw new Error("incremental verification failed");
  result = run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"], fullEnv); if (result !== 0) throw new Error("full migration deployment failed");
  result = run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"], fullEnv); if (result !== 0) throw new Error("deployed schema differs from schema.prisma");
  result = run(process.execPath, ["--conditions=react-server", ".phase3-test-build/scripts/phase5e2-db-integration.js"], fullEnv); if (result !== 0) throw new Error("Phase 5E.2 integration assertions failed");
} catch (error) { if (result === 0) result = 1; console.error(error instanceof Error ? error.message : "Phase 5E.2 disposable validation failed"); }
finally { const cleanup = run(process.execPath, [".phase3-test-build/scripts/phase5e2-schema-control.js"], { ...baseEnv, PHASE5E2_SCHEMA_ACTION: "cleanup" }); rmSync(work, { recursive: true, force: true }); rmSync(".phase3-test-build", { recursive: true, force: true }); if (cleanup !== 0) result = cleanup; }
process.exit(result);
