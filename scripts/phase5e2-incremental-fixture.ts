import { PrismaClient } from "@prisma/client";
if (process.env.PHASE5E2_MIGRATION_STAGE !== "PRE_5E2") throw new Error("Incremental fixture stage is not authorized");
const db = new PrismaClient();
async function main() {
  await db.$executeRawUnsafe(`INSERT INTO "User" ("id", "clerkId", "name", "role", "accountStatus", "online", "accessibilityPreferences", "createdAt") VALUES ('phase5e2-historical-actor', 'phase5e2-historical-actor-clerk', 'Historical admin', 'ADMIN', 'ACTIVE', false, ARRAY[]::TEXT[], CURRENT_TIMESTAMP), ('phase5e2-historical-target', 'phase5e2-historical-target-clerk', 'Historical viewer', 'VIEWER', 'ACTIVE', false, ARRAY[]::TEXT[], CURRENT_TIMESTAMP)`);
  await db.$executeRawUnsafe(`INSERT INTO "AdminRoleChangeAudit" ("id", "actorId", "targetId", "action", "previousRole", "newRole", "createdAt") VALUES ('phase5e2-historical-audit', 'phase5e2-historical-actor', 'phase5e2-historical-target', 'ASSIGN_OPERATOR', 'VIEWER', 'OPERATOR', CURRENT_TIMESTAMP), ('phase5e2-historical-return-audit', 'phase5e2-historical-actor', 'phase5e2-historical-target', 'RETURN_TO_VIEWER', 'OPERATOR', 'VIEWER', CURRENT_TIMESTAMP)`);
}
void main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
