import assert from "node:assert/strict";
import { PrismaClient, Role } from "@prisma/client";

if (process.env.PHASE5D_MIGRATION_STAGE !== "POST_5D") throw new Error("Incremental verification stage is not authorized");
const db = new PrismaClient();
async function main() {
  const users = await db.user.findMany({ where: { clerkId: { startsWith: "phase5d-incremental-" } }, orderBy: { clerkId: "asc" }, select: { clerkId: true, role: true, name: true } });
  assert.equal(users.length, 3);
  assert.deepEqual(new Set(users.map(value => value.role)), new Set([Role.VIEWER, Role.OPERATOR, Role.ADMIN]));
  assert.equal(users.every(value => Boolean(value.name)), true);
  assert.equal(await db.operatorApplication.count(), 0, "the additive migration requires no backfill");

  const indexes = await db.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = current_schema() AND tablename = 'OperatorApplication'
  `;
  assert.deepEqual(new Set(indexes.map(value => value.indexname)), new Set([
    "OperatorApplication_pkey",
    "OperatorApplication_applicantId_submittedAt_idx",
    "OperatorApplication_status_submittedAt_idx",
    "OperatorApplication_reviewedById_reviewedAt_idx",
    "OperatorApplication_one_pending_per_applicant",
  ]));
  const pendingIndex = indexes.find(value => value.indexname === "OperatorApplication_one_pending_per_applicant");
  assert.match(pendingIndex?.indexdef ?? "", /UNIQUE.*\("applicantId"\).*WHERE \(status = 'PENDING'/);

  const constraints = await db.$queryRaw<Array<{ name: string; delete_action: string }>>`
    SELECT conname AS name, confdeltype::text AS delete_action
    FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace AND conrelid = '"OperatorApplication"'::regclass AND contype = 'f'
  `;
  assert.deepEqual(new Set(constraints.map(value => value.name)), new Set(["OperatorApplication_applicantId_fkey", "OperatorApplication_reviewedById_fkey"]));
  assert.equal(constraints.every(value => value.delete_action === "r"), true);
}
void main().finally(() => db.$disconnect()).catch(error => { console.error(error instanceof Error ? error.message : "Incremental verification failed"); process.exitCode = 1; });
