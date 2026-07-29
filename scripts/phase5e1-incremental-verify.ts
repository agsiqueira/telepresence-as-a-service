import assert from "node:assert/strict";
import { AccountStatus, PrismaClient, Role } from "@prisma/client";
if (process.env.PHASE5E1_MIGRATION_STAGE !== "POST_5E1") throw new Error("Incremental verification stage is not authorized");
const db = new PrismaClient();
async function main() {
  const existing = await db.user.findUniqueOrThrow({ where: { clerkId: "phase5e1-existing-viewer" } });
  assert.equal(existing.role, Role.VIEWER); assert.equal(existing.accountStatus, AccountStatus.ACTIVE); assert.equal(existing.deactivatedAt, null);
  const constraints = await db.$queryRaw<Array<{ name: string; delete_action: string }>>`SELECT conname AS name, confdeltype::text AS delete_action FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND conrelid = '"AccountLifecycleAudit"'::regclass AND contype = 'f'`;
  assert.deepEqual(new Set(constraints.map(value => value.name)), new Set(["AccountLifecycleAudit_actorId_fkey", "AccountLifecycleAudit_targetId_fkey"]));
  assert.equal(constraints.every(value => value.delete_action === "r"), true);
}
void main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
