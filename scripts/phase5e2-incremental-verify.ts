import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
if (process.env.PHASE5E2_MIGRATION_STAGE !== "POST_5E2") throw new Error("Incremental verification stage is not authorized");
const db = new PrismaClient();
async function main() {
  const historical = await db.adminRoleChangeAudit.findMany({ where: { id: { in: ["phase5e2-historical-audit", "phase5e2-historical-return-audit"] } }, orderBy: { id: "asc" } }); assert.equal(historical.length, 2); assert.equal(historical.every(value => value.reason === null), true); assert.deepEqual(new Set(historical.map(value => value.action)), new Set(["ASSIGN_OPERATOR", "RETURN_TO_VIEWER"]));
  const constraints = await db.$queryRaw<Array<{ name: string }>>`SELECT conname AS name FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND conrelid = '"AdminRoleChangeAudit"'::regclass AND contype = 'c'`;
  assert.deepEqual(new Set(constraints.map(value => value.name)), new Set(["AdminRoleChangeAudit_transition_check", "AdminRoleChangeAudit_governance_reason_check"]));
  const indexes = await db.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'AdminRoleChangeAudit'`;
  assert.equal(indexes.some(value => value.indexname === "AdminRoleChangeAudit_action_createdAt_idx"), true);
}
void main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
