import { AccountStatus, OfferStatus, OperatorApplicationStatus, Prisma, PrismaClient, Role, TripStatus } from "@prisma/client";

// Bootstrap only: after the first ADMIN exists, all promotion and removal must use administrator governance.

const target = process.argv.find(value => value.startsWith("--clerk-user-id="))?.slice("--clerk-user-id=".length);
const confirmation = process.argv.includes("--confirm=PROVISION_INITIAL_ADMIN");
if (!target || target.trim() !== target || !confirmation) {
  console.error("Usage: node scripts/provision-initial-admin.mjs --clerk-user-id=<exact-id> --confirm=PROVISION_INITIAL_ADMIN");
  process.exit(1);
}

const db = new PrismaClient();
try {
  await db.$transaction(async tx => {
    if (await tx.user.count({ where: { role: Role.ADMIN } })) throw new Error("Initial administrator provisioning is unavailable after any administrator exists; use administrator governance");
    const matches = await tx.user.findMany({ where: { clerkId: target }, select: { id: true, role: true, accountStatus: true, online: true, pendingOfferTripId: true, activeTripId: true }, take: 2 });
    if (matches.length !== 1) throw new Error("Exactly one persisted application user must match the supplied identity");
    const participant = matches[0];
    if (participant.role !== Role.VIEWER) throw new Error("Only an existing VIEWER may be provisioned as the initial administrator");
    if (participant.accountStatus !== AccountStatus.ACTIVE) throw new Error("Only an ACTIVE account may be provisioned as the initial administrator");
    if (participant.online || participant.pendingOfferTripId || participant.activeTripId) throw new Error("Initial administrator must be offline and free of operational reservations");
    const [viewerTrips, operatorTrips, offeredTrips, offers, pendingApplications] = await Promise.all([
      tx.trip.count({ where: { viewerId: participant.id, status: { in: [TripStatus.REQUESTED, TripStatus.OFFERED, TripStatus.ACCEPTED, TripStatus.IN_PROGRESS, TripStatus.ENDED] } } }),
      tx.trip.count({ where: { operatorId: participant.id, status: { in: [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS] } } }),
      tx.trip.count({ where: { offeredOperatorId: participant.id, status: TripStatus.OFFERED } }),
      tx.tripOffer.count({ where: { operatorId: participant.id, status: OfferStatus.OFFERED } }),
      tx.operatorApplication.count({ where: { applicantId: participant.id, status: OperatorApplicationStatus.PENDING } }),
    ]);
    if (viewerTrips + operatorTrips + offeredTrips + offers > 0) throw new Error("Initial administrator has unfinished visit or marketplace activity");
    if (pendingApplications) throw new Error("Resolve the pending Operator application before initial administrator provisioning");
    const changed = await tx.user.updateMany({ where: { id: participant.id, role: Role.VIEWER, accountStatus: AccountStatus.ACTIVE, online: false, pendingOfferTripId: null, activeTripId: null }, data: { role: Role.ADMIN } });
    if (changed.count !== 1) throw new Error("Administrator provisioning was not applied");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  console.log("Initial administrator provisioned successfully.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Administrator provisioning failed");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
