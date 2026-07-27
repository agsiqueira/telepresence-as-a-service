import { PrismaClient, Role } from "@prisma/client";

const target = process.argv.find(value => value.startsWith("--clerk-user-id="))?.slice("--clerk-user-id=".length);
const confirmation = process.argv.includes("--confirm=PROVISION_INITIAL_ADMIN");
if (!target || target.trim() !== target || !confirmation) {
  console.error("Usage: node scripts/provision-initial-admin.mjs --clerk-user-id=<exact-id> --confirm=PROVISION_INITIAL_ADMIN");
  process.exit(1);
}

const db = new PrismaClient();
try {
  const matches = await db.user.findMany({ where: { clerkId: target }, select: { id: true, role: true }, take: 2 });
  if (matches.length !== 1) throw new Error("Exactly one persisted application user must match the supplied identity");
  if (matches[0].role !== Role.VIEWER) throw new Error("Only an existing VIEWER may be provisioned as the initial administrator");
  const changed = await db.user.updateMany({ where: { id: matches[0].id, role: Role.VIEWER, online: false, pendingOfferTripId: null, activeTripId: null }, data: { role: Role.ADMIN } });
  if (changed.count !== 1) throw new Error("Administrator provisioning was not applied");
  console.log("Initial administrator provisioned successfully.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Administrator provisioning failed");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
