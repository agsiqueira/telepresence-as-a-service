import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migrationName = "20260728230000_phase5e1a_account_lifecycle";
const migration = readFileSync(`prisma/migrations/${migrationName}/migration.sql`, "utf8");
const migrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();

assert.match(schema, /enum AccountStatus\s*{\s*ACTIVE\s*DEACTIVATED\s*}/s);
assert.match(schema, /enum AccountLifecycleAction\s*{\s*DEACTIVATE\s*REACTIVATE\s*}/s);
assert.match(schema, /accountStatus\s+AccountStatus\s+@default\(ACTIVE\)/);
assert.match(schema, /deactivatedAt\s+DateTime\?/);
assert.doesNotMatch(schema, /deactivatedBy|reactivatedBy|reactivatedAt/);
assert.match(schema, /model AccountLifecycleAudit\s*{/);
for (const field of ["actorId", "targetId", "action", "previousStatus", "newStatus", "reason", "createdAt"]) assert.match(schema, new RegExp(`\\b${field}\\s+`));
assert.match(schema, /@relation\("AccountLifecycleActor"[\s\S]*?onDelete: Restrict\)/);
assert.match(schema, /@relation\("AccountLifecycleTarget"[\s\S]*?onDelete: Restrict\)/);
assert.match(schema, /@@index\(\[accountStatus, role]\)/);
assert.match(schema, /@@index\(\[targetId, createdAt]\)/);
assert.match(schema, /@@index\(\[actorId, createdAt]\)/);
assert.match(schema, /@@index\(\[action, createdAt]\)/);

assert.match(migration, /CREATE TYPE "AccountStatus" AS ENUM \('ACTIVE', 'DEACTIVATED'\)/);
assert.match(migration, /ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE'/);
assert.match(migration, /ADD COLUMN "deactivatedAt" TIMESTAMP\(3\)/);
assert.match(migration, /CREATE TABLE "AccountLifecycleAudit"/);
assert.match(migration, /AccountLifecycleAudit_reason_check/);
assert.match(migration, /char_length\(btrim\("reason"\)\) BETWEEN 1 AND 500/);
assert.match(migration, /AccountLifecycleAudit_transition_check/);
assert.equal((migration.match(/ON DELETE RESTRICT ON UPDATE CASCADE/g) ?? []).length, 2);
assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/);
assert.ok(migrations.includes(migrationName));
const governanceMigration = "20260729010000_phase5e2a_administrator_governance";
assert.ok(migrations.includes(governanceMigration));
assert.ok(migrations.indexOf(governanceMigration) > migrations.indexOf(migrationName));
console.log("Phase 5E.1A account lifecycle schema assertions passed.");
