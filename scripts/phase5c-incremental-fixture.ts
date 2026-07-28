import assert from "node:assert/strict";
import { PrismaClient, Role } from "@prisma/client";

if (process.env.PHASE5C_MIGRATION_STAGE !== "PRE_5C") throw new Error("Incremental fixture stage is not authorized");
const db = new PrismaClient();
async function main() {
  const records = await Promise.all([
    db.user.create({ data: { clerkId: "phase5c-incremental-viewer", name: "Existing viewer", role: Role.VIEWER } }),
    db.user.create({ data: { clerkId: "phase5c-incremental-operator", name: "Existing operator", role: Role.OPERATOR } }),
    db.user.create({ data: { clerkId: "phase5c-incremental-admin", name: "Existing administrator", role: Role.ADMIN } }),
  ]);
  assert.deepEqual(records.map(value => value.role), [Role.VIEWER, Role.OPERATOR, Role.ADMIN]);
}
void main().finally(() => db.$disconnect()).catch(error => { console.error(error instanceof Error ? error.message : "Incremental fixture failed"); process.exitCode = 1; });
