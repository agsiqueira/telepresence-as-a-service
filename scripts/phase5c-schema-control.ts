import { PrismaClient } from "@prisma/client";

const schemas = ["phase5c_full_validation", "phase5c_incremental_validation"] as const;
if (!process.env.PHASE5C_TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.PHASE5C_TEST_DATABASE_URL) throw new Error("Unsafe Phase 5C schema-control mapping");
if (process.env.PHASE5C_SCHEMA_ACTION !== "setup" && process.env.PHASE5C_SCHEMA_ACTION !== "cleanup") throw new Error("Invalid Phase 5C schema action");

async function main() {
  const db = new PrismaClient();
  try {
    for (const schema of schemas) await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    if (process.env.PHASE5C_SCHEMA_ACTION === "setup") {
      for (const schema of schemas) await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    } else {
      const remaining = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM pg_namespace
        WHERE nspname IN ('phase5c_full_validation', 'phase5c_incremental_validation')
      `;
      if (Number(remaining[0].count) !== 0) throw new Error("Phase 5C cleanup verification failed");
    }
  } finally { await db.$disconnect(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Phase 5C schema control failed"); process.exitCode = 1; });
