import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260728120000_phase5c_admin_role_audit/migration.sql",
  "utf8"
);
const participantUi = readFileSync("components/AdminParticipants.tsx", "utf8");

assert.match(schema, /enum AdminRoleChangeAction \{\s+ASSIGN_OPERATOR\s+RETURN_TO_VIEWER\s+\}/);
assert.match(schema, /model AdminRoleChangeAudit \{/);
assert.match(schema, /actor\s+User\s+@relation\("AdminRoleChangeActor", fields: \[actorId\], references: \[id\], onDelete: Restrict\)/);
assert.match(schema, /target\s+User\s+@relation\("AdminRoleChangeTarget", fields: \[targetId\], references: \[id\], onDelete: Restrict\)/);
assert.match(schema, /previousRole\s+Role/);
assert.match(schema, /newRole\s+Role/);
assert.match(schema, /createdAt\s+DateTime\s+@default\(now\(\)\)/);
assert.match(schema, /@@index\(\[targetId, createdAt\]\)/);
assert.match(schema, /@@index\(\[actorId, createdAt\]\)/);
assert.match(schema, /role\s+Role\s+@default\(VIEWER\)/);
assert.match(schema, /enum Role \{\s+ADMIN\s+OPERATOR\s+VIEWER\s+\}/);

assert.match(migration, /CREATE TYPE "AdminRoleChangeAction" AS ENUM \('ASSIGN_OPERATOR', 'RETURN_TO_VIEWER'\)/);
assert.match(migration, /CREATE TABLE "AdminRoleChangeAudit"/);
assert.match(migration, /"previousRole" "Role" NOT NULL/);
assert.match(migration, /"newRole" "Role" NOT NULL/);
assert.match(migration, /"createdAt" TIMESTAMP\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
assert.match(migration, /"AdminRoleChangeAudit_targetId_createdAt_idx"/);
assert.match(migration, /"AdminRoleChangeAudit_actorId_createdAt_idx"/);
assert.equal((migration.match(/ON DELETE RESTRICT ON UPDATE CASCADE/g) ?? []).length, 2);

assert.equal(existsSync("app/api/admin/participants/[reference]/role/route.ts"), false);
assert.doesNotMatch(participantUi, /Assign operator|Return to viewer|\/role/);

console.log("Phase 5C.1 administrative audit schema assertions passed.");
