import { PrismaClient } from "@prisma/client";
if (process.env.PHASE5E1_MIGRATION_STAGE !== "PRE_5E1") throw new Error("Incremental fixture stage is not authorized");
const db = new PrismaClient();
void db.$executeRaw`
  INSERT INTO "User" ("id", "clerkId", "name", "role", "online", "accessibilityPreferences", "createdAt")
  VALUES ('phase5e1-existing-user-id', 'phase5e1-existing-viewer', 'Existing viewer', 'VIEWER', false, ARRAY[]::TEXT[], CURRENT_TIMESTAMP)
`
  .finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
