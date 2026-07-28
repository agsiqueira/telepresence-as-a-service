import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migrationName = "20260728200000_phase5d_operator_applications";
const migration = readFileSync(`prisma/migrations/${migrationName}/migration.sql`, "utf8");
const migrations = readdirSync("prisma/migrations", { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

assert.match(schema, /enum OperatorApplicationStatus\s*{\s*PENDING\s*APPROVED\s*REJECTED\s*WITHDRAWN\s*}/s);
assert.match(schema, /operatorApplications\s+OperatorApplication\[\]\s+@relation\("OperatorApplicationApplicant"\)/);
assert.match(schema, /applicationsReviewed\s+OperatorApplication\[\]\s+@relation\("OperatorApplicationReviewer"\)/);
assert.match(schema, /applicant\s+User\s+@relation\("OperatorApplicationApplicant", fields: \[applicantId], references: \[id], onDelete: Restrict\)/);
assert.match(schema, /reviewer\s+User\?\s+@relation\("OperatorApplicationReviewer", fields: \[reviewedById], references: \[id], onDelete: Restrict\)/);

for (const required of ["applicantId", "qualifications", "relevantExperience", "languages", "availability", "status", "submittedAt", "updatedAt"]) {
  assert.match(schema, new RegExp(`\\b${required}\\s+`));
}
for (const nullable of ["supportingUrl", "additionalNote", "reviewedById", "reviewNote", "reviewedAt", "withdrawnAt"]) {
  assert.match(schema, new RegExp(`\\b${nullable}\\s+\\w+\\?`));
}
assert.match(schema, /@@index\(\[applicantId, submittedAt]\)/);
assert.match(schema, /@@index\(\[status, submittedAt]\)/);
assert.match(schema, /@@index\(\[reviewedById, reviewedAt]\)/);
assert.doesNotMatch(schema, /@@unique\(\[applicantId, status]\)/, "terminal application history must not be unique per status");

assert.match(migration, /CREATE TYPE "OperatorApplicationStatus" AS ENUM \('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'\)/);
assert.match(migration, /"applicantId" TEXT NOT NULL/);
assert.match(migration, /"reviewedById" TEXT,/);
assert.match(migration, /"supportingUrl" TEXT,/);
assert.match(migration, /"status" "OperatorApplicationStatus" NOT NULL DEFAULT 'PENDING'/);
for (const index of [
  "OperatorApplication_applicantId_submittedAt_idx",
  "OperatorApplication_status_submittedAt_idx",
  "OperatorApplication_reviewedById_reviewedAt_idx",
]) assert.match(migration, new RegExp(`CREATE INDEX "${index}"`));
assert.match(migration, /CREATE UNIQUE INDEX "OperatorApplication_one_pending_per_applicant"\s+ON "OperatorApplication" \("applicantId"\)\s+WHERE "status" = 'PENDING';/s);
assert.equal((migration.match(/CREATE UNIQUE INDEX/g) ?? []).length, 1);
assert.doesNotMatch(migration, /UNIQUE[^;]*\("applicantId",\s*"status"\)/s);
for (const constraint of ["OperatorApplication_applicantId_fkey", "OperatorApplication_reviewedById_fkey"]) {
  assert.match(migration, new RegExp(`ADD CONSTRAINT "${constraint}"[\\s\\S]*?ON DELETE RESTRICT ON UPDATE CASCADE`));
}

assert.ok(migrations.indexOf(migrationName) > migrations.indexOf("20260728120000_phase5c_admin_role_audit"));
assert.equal(migrations.at(-1), migrationName);

console.log("Phase 5D.1 Operator Application schema and migration assertions passed without a database connection.");
