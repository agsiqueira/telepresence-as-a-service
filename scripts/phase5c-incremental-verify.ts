import assert from "node:assert/strict";
import { PrismaClient, Role } from "@prisma/client";

if (process.env.PHASE5C_MIGRATION_STAGE !== "POST_5C") throw new Error("Incremental verification stage is not authorized");
const db = new PrismaClient();
async function main() {
  const users = await db.user.findMany({ where: { clerkId: { startsWith: "phase5c-incremental-" } }, orderBy: { clerkId: "asc" }, select: { clerkId: true, role: true, name: true } });
  assert.equal(users.length, 3);
  assert.deepEqual(new Set(users.map(value => value.role)), new Set([Role.VIEWER, Role.OPERATOR, Role.ADMIN]));
  assert.equal(users.every(value => Boolean(value.name)), true);
  assert.equal(await db.adminRoleChangeAudit.count(), 0, "the additive migration requires no backfill");
  const indexes = await db.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'AdminRoleChangeAudit'`;
  assert.deepEqual(new Set(indexes.map(value => value.indexname)), new Set(["AdminRoleChangeAudit_pkey", "AdminRoleChangeAudit_targetId_createdAt_idx", "AdminRoleChangeAudit_actorId_createdAt_idx"]));
  const constraints = await db.$queryRaw<Array<{ name: string; delete_action: string }>>`
    SELECT conname AS name, confdeltype::text AS delete_action
    FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace AND conrelid = '"AdminRoleChangeAudit"'::regclass AND contype = 'f'
  `;
  assert.deepEqual(new Set(constraints.map(value => value.name)), new Set(["AdminRoleChangeAudit_actorId_fkey", "AdminRoleChangeAudit_targetId_fkey"]));
  assert.equal(constraints.every(value => value.delete_action === "r"), true);
}
void main().finally(() => db.$disconnect()).catch(error => { console.error(error instanceof Error ? error.message : "Incremental verification failed"); process.exitCode = 1; });
