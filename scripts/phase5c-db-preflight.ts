import { PrismaClient } from "@prisma/client";

if (!process.env.PHASE5C_TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.PHASE5C_TEST_DATABASE_URL) {
  throw new Error("Unsafe Phase 5C test database mapping");
}
const expected = process.env.PHASE5C_EXPECTED_DATABASE_FINGERPRINT;
if (!expected || expected.length < 16 || expected.length > 128) {
  throw new Error("A valid Phase 5C database fingerprint is required");
}

async function main() {
  const db = new PrismaClient();
  try {
    const rows = await db.$queryRaw<Array<{ fingerprint: string | null }>>`
      SELECT shobj_description(oid, 'pg_database') AS fingerprint
      FROM pg_database
      WHERE datname = current_database()
    `;
    if (rows.length !== 1 || rows[0].fingerprint !== expected) {
      throw new Error("Disposable database fingerprint mismatch; refusing all mutations");
    }
    console.log("Phase 5C disposable database fingerprint verified.");
  } finally {
    await db.$disconnect();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Disposable database fingerprint verification failed");
  process.exitCode = 1;
});
