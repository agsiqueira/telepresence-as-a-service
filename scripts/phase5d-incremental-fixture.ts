import assert from "node:assert/strict";
import { PrismaClient, Role } from "@prisma/client";

if (process.env.PHASE5D_MIGRATION_STAGE !== "PRE_5D") throw new Error("Incremental fixture stage is not authorized");
const db = new PrismaClient();
async function main() {
  const records = await Promise.all([
    db.user.create({ data: { clerkId: "phase5d-incremental-viewer", name: "Existing viewer", role: Role.VIEWER } }),
    db.user.create({ data: { clerkId: "phase5d-incremental-operator", name: "Existing operator", role: Role.OPERATOR } }),
    db.user.create({ data: { clerkId: "phase5d-incremental-admin", name: "Existing administrator", role: Role.ADMIN } }),
  ]);
  assert.deepEqual(records.map(value => value.role), [Role.VIEWER, Role.OPERATOR, Role.ADMIN]);
}
void main().finally(() => db.$disconnect()).catch(error => { console.error(error instanceof Error ? error.message : "Incremental fixture failed"); process.exitCode = 1; });
