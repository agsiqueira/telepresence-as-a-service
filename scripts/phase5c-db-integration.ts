import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { OfferStatus, OperatorPilotStatus, Prisma, PrismaClient, Role, TripStatus } from "@prisma/client";
import { assignNextOperator } from "../lib/marketplace";
import { acceptTripOffer, createTripRequest } from "../lib/phase3-services";
import { assignViewerAsOperator, returnOperatorToViewer } from "../lib/role-transitions";

if (process.env.PHASE5C_ACTIVE_SCHEMA !== "FULL" || process.env.PHASE5C_CONFIRM_DISPOSABLE_DATABASE !== "YES_DELETE_PHASE5C_TEST_DATA") throw new Error("Unsafe Phase 5C integration mapping");
const db = new PrismaClient();
const run = `phase5c-${randomUUID()}`;
const serial = async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt >= 3) throw error;
    }
  }
};

async function user(role: Role, suffix: string = randomUUID(), online = false) { return db.user.create({ data: { clerkId: `${run}-${suffix}`, role, online, name: `Phase 5C ${role.toLowerCase()}` } }); }
async function destination(suffix: string = randomUUID()) { return db.destination.create({ data: { slug: `${run}-${suffix}`, name: "Phase 5C destination", shortDescription: "Disposable validation", city: "Phase 5C", meetingArea: "Entrance", category: "Test", durationOptions: [30] } }); }
async function profile(userId: string, pilotStatus: OperatorPilotStatus = OperatorPilotStatus.APPROVED) { return db.operatorProfile.create({ data: { userId, operatingArea: "Phase 5C", serviceRadiusKm: 5, supportsCustom: false, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30], pilotStatus } }); }
async function trip(viewerId: string, destinationId: string, suffix: string, data: Partial<Prisma.TripUncheckedCreateInput> = {}) { return db.trip.create({ data: { viewerId, destinationId, destination: "Phase 5C destination", operatingArea: "Phase 5C", requestedDuration: 30, livekitRoom: `${run}-${suffix}`, ...data } }); }
async function audits(targetId: string) { return db.adminRoleChangeAudit.count({ where: { targetId } }); }

async function main() {
  let triggerInstalled = false;
  try {
    const actor = await user(Role.ADMIN, "administrator");
    const sharedDestination = await destination("shared");

    // New profile, duplicate promotion, offline and exact audit behavior.
    const target = await user(Role.VIEWER, "new-profile", true);
    const promotions = await Promise.all([assignViewerAsOperator(db, actor.id, target.id), assignViewerAsOperator(db, actor.id, target.id)]);
    assert.equal(promotions.filter(value => value.ok).length, 1);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: target.id } })).online, false);
    assert.equal(await db.operatorProfile.count({ where: { userId: target.id } }), 1);
    assert.equal(await db.operatorDestination.count({ where: { operatorId: target.id } }), 0);
    const exactAudit = await db.adminRoleChangeAudit.findFirstOrThrow({ where: { targetId: target.id } });
    assert.deepEqual({ actorId: exactAudit.actorId, targetId: exactAudit.targetId, action: exactAudit.action, previousRole: exactAudit.previousRole, newRole: exactAudit.newRole }, { actorId: actor.id, targetId: target.id, action: "ASSIGN_OPERATOR", previousRole: Role.VIEWER, newRole: Role.OPERATOR });

    const demotions = await Promise.all([returnOperatorToViewer(db, actor.id, target.id), returnOperatorToViewer(db, actor.id, target.id)]);
    assert.equal(demotions.filter(value => value.ok).length, 1);
    assert.equal(await audits(target.id), 2);

    // Dormant profile reuse, PENDING reset and SUSPENDED preservation.
    const dormant = await user(Role.VIEWER, "dormant", true); await profile(dormant.id, OperatorPilotStatus.APPROVED); await db.operatorDestination.create({ data: { operatorId: dormant.id, destinationId: sharedDestination.id } });
    assert.equal((await assignViewerAsOperator(db, actor.id, dormant.id)).ok, true);
    assert.equal(await db.operatorProfile.count({ where: { userId: dormant.id } }), 1);
    assert.equal((await db.operatorProfile.findUniqueOrThrow({ where: { userId: dormant.id } })).pilotStatus, OperatorPilotStatus.PENDING);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: dormant.id } })).online, false);
    assert.equal(await db.operatorDestination.count({ where: { operatorId: dormant.id } }), 0);
    assert.equal((await returnOperatorToViewer(db, actor.id, dormant.id)).ok, true);
    await db.operatorProfile.update({ where: { userId: dormant.id }, data: { pilotStatus: OperatorPilotStatus.SUSPENDED } });
    assert.equal((await assignViewerAsOperator(db, actor.id, dormant.id)).ok, true);
    assert.equal((await db.operatorProfile.findUniqueOrThrow({ where: { userId: dormant.id } })).pilotStatus, OperatorPilotStatus.SUSPENDED);

    // Every unfinished Viewer state, including ENDED pending feedback, blocks without side effects.
    for (const status of [TripStatus.REQUESTED, TripStatus.OFFERED, TripStatus.ACCEPTED, TripStatus.IN_PROGRESS, TripStatus.ENDED]) {
      const viewer = await user(Role.VIEWER, `viewer-block-${status}`); await profile(viewer.id, OperatorPilotStatus.SUSPENDED); await db.operatorDestination.create({ data: { operatorId: viewer.id, destinationId: sharedDestination.id } });
      await trip(viewer.id, sharedDestination.id, `viewer-block-${status}`, { status });
      const beforeProfile = await db.operatorProfile.findUniqueOrThrow({ where: { userId: viewer.id } });
      const result = await assignViewerAsOperator(db, actor.id, viewer.id);
      assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "UNFINISHED_VIEWER_OBLIGATION");
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: viewer.id } })).role, Role.VIEWER);
      assert.equal((await db.operatorProfile.findUniqueOrThrow({ where: { userId: viewer.id } })).pilotStatus, beforeProfile.pilotStatus);
      assert.equal(await db.operatorDestination.count({ where: { operatorId: viewer.id } }), 1);
      assert.equal(await audits(viewer.id), 0);
    }
    for (const status of [TripStatus.FEEDBACK_COMPLETED, TripStatus.CANCELLED, TripStatus.NO_OPERATOR_AVAILABLE]) {
      const viewer = await user(Role.VIEWER, `viewer-complete-${status}`);
      await trip(viewer.id, sharedDestination.id, `viewer-complete-${status}`, { status, ...(status === TripStatus.FEEDBACK_COMPLETED ? { feedbackSkippedAt: new Date(), feedbackCompletedAt: new Date() } : {}) });
      assert.equal((await assignViewerAsOperator(db, actor.id, viewer.id)).ok, true, `${status} history must not block promotion`);
    }

    // Operator active states and outstanding offers block without mutations.
    for (const status of [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS]) {
      const operator = await user(Role.OPERATOR, `operator-block-${status}`, true); await profile(operator.id); await db.operatorDestination.create({ data: { operatorId: operator.id, destinationId: sharedDestination.id } });
      const viewer = await user(Role.VIEWER, `operator-block-viewer-${status}`); await trip(viewer.id, sharedDestination.id, `operator-block-${status}`, { status, operatorId: operator.id });
      const result = await returnOperatorToViewer(db, actor.id, operator.id);
      assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "ACTIVE_OPERATOR_OBLIGATION");
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: operator.id } })).role, Role.OPERATOR);
      assert.equal((await db.operatorProfile.findUniqueOrThrow({ where: { userId: operator.id } })).pilotStatus, OperatorPilotStatus.APPROVED);
      assert.equal(await db.operatorDestination.count({ where: { operatorId: operator.id } }), 1); assert.equal(await audits(operator.id), 0);
    }
    const offeredOperator = await user(Role.OPERATOR, "operator-block-offer", true); await profile(offeredOperator.id); await db.operatorDestination.create({ data: { operatorId: offeredOperator.id, destinationId: sharedDestination.id } });
    const offeredViewer = await user(Role.VIEWER, "operator-block-offer-viewer");
    const offeredTrip = await trip(offeredViewer.id, sharedDestination.id, "operator-block-offer", { status: TripStatus.OFFERED, offeredOperatorId: offeredOperator.id, offerExpiresAt: new Date(Date.now() + 60_000) });
    await db.tripOffer.create({ data: { tripId: offeredTrip.id, operatorId: offeredOperator.id, status: OfferStatus.OFFERED, expiresAt: new Date(Date.now() + 60_000) } });
    await db.user.update({ where: { id: offeredOperator.id }, data: { pendingOfferTripId: offeredTrip.id } });
    assert.equal((await returnOperatorToViewer(db, actor.id, offeredOperator.id)).ok, false);
    assert.equal(await db.operatorDestination.count({ where: { operatorId: offeredOperator.id } }), 1); assert.equal(await audits(offeredOperator.id), 0);

    // Reservation pointers independently block either transition, even before recovery clears a stale pointer.
    for (const field of ["pendingOfferTripId", "activeTripId"] as const) {
      const viewer = await user(Role.VIEWER, `viewer-pointer-${field}`); await db.user.update({ where: { id: viewer.id }, data: { [field]: `${run}-${field}` } });
      const promotion = await assignViewerAsOperator(db, actor.id, viewer.id); assert.equal(promotion.ok, false); if (!promotion.ok) assert.equal(promotion.code, "UNFINISHED_VIEWER_OBLIGATION"); assert.equal(await audits(viewer.id), 0);
      const operator = await user(Role.OPERATOR, `operator-pointer-${field}`); await profile(operator.id); await db.user.update({ where: { id: operator.id }, data: { [field]: `${run}-${field}` } });
      const demotion = await returnOperatorToViewer(db, actor.id, operator.id); assert.equal(demotion.ok, false); if (!demotion.ok) assert.equal(demotion.code, "ACTIVE_OPERATOR_OBLIGATION"); assert.equal(await audits(operator.id), 0);
    }

    // Inactive offer/history states do not block demotion.
    for (const offerStatus of [OfferStatus.ACCEPTED, OfferStatus.DECLINED, OfferStatus.EXPIRED]) {
      const operator = await user(Role.OPERATOR, `inactive-offer-${offerStatus}`); await profile(operator.id);
      const viewer = await user(Role.VIEWER, `inactive-offer-viewer-${offerStatus}`);
      const inactiveTrip = await trip(viewer.id, sharedDestination.id, `inactive-offer-${offerStatus}`, { status: TripStatus.ENDED, operatorId: operator.id, endedAt: new Date() });
      await db.tripOffer.create({ data: { tripId: inactiveTrip.id, operatorId: operator.id, status: offerStatus, expiresAt: new Date(), respondedAt: new Date() } });
      assert.equal((await returnOperatorToViewer(db, actor.id, operator.id)).ok, true, `${offerStatus} history must not block demotion`);
    }

    // Successful destination cleanup preserves profile and unrelated records.
    const cleanupOperator = await user(Role.OPERATOR, "destination-cleanup", true); await profile(cleanupOperator.id); const secondDestination = await destination("cleanup-second");
    await db.operatorDestination.createMany({ data: [{ operatorId: cleanupOperator.id, destinationId: sharedDestination.id }, { operatorId: cleanupOperator.id, destinationId: secondDestination.id }] });
    const destinationCount = await db.destination.count(); const tripCount = await db.trip.count(); const offerCount = await db.tripOffer.count();
    assert.equal((await returnOperatorToViewer(db, actor.id, cleanupOperator.id)).ok, true);
    assert.equal(await db.operatorDestination.count({ where: { operatorId: cleanupOperator.id } }), 0);
    assert.ok(await db.operatorProfile.findUnique({ where: { userId: cleanupOperator.id } }));
    const cleanedUser = await db.user.findUniqueOrThrow({ where: { id: cleanupOperator.id } }); assert.equal(cleanedUser.role, Role.VIEWER); assert.equal(cleanedUser.online, false);
    assert.equal(await db.destination.count(), destinationCount); assert.equal(await db.trip.count(), tripCount); assert.equal(await db.tripOffer.count(), offerCount);

    // Promotion versus trip creation: exactly one legal winner.
    const available = await user(Role.OPERATOR, "available", true); await profile(available.id); await db.operatorDestination.create({ data: { operatorId: available.id, destinationId: sharedDestination.id } });
    const racingViewer = await user(Role.VIEWER, "racing-viewer");
    const [promotion, creation] = await Promise.all([
      assignViewerAsOperator(db, actor.id, racingViewer.id),
      createTripRequest(db, racingViewer.id, { destinationId: sharedDestination.id, requestedDuration: 30, accessibilityNeeds: [] }, () => `${run}-race-room`),
    ]);
    assert.equal(promotion.ok && creation.ok, false);
    const unfinished = await db.trip.count({ where: { viewerId: racingViewer.id, status: { in: [TripStatus.REQUESTED, TripStatus.OFFERED, TripStatus.ACCEPTED, TripStatus.IN_PROGRESS, TripStatus.ENDED] } } });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: racingViewer.id } })).role === Role.OPERATOR && unfinished > 0, false);

    // Demotion versus offer assignment.
    await db.user.updateMany({ where: { clerkId: { startsWith: run }, role: Role.OPERATOR }, data: { online: false } });
    const assignmentOperator = await user(Role.OPERATOR, "assignment-race", true); await profile(assignmentOperator.id); await db.operatorDestination.create({ data: { operatorId: assignmentOperator.id, destinationId: sharedDestination.id } });
    const assignmentViewer = await user(Role.VIEWER, "assignment-race-viewer"); const assignmentTrip = await trip(assignmentViewer.id, sharedDestination.id, "assignment-race");
    const [demotionRace, assigned] = await Promise.all([returnOperatorToViewer(db, actor.id, assignmentOperator.id), serial(tx => assignNextOperator(tx, assignmentTrip.id))]);
    const assignmentUser = await db.user.findUniqueOrThrow({ where: { id: assignmentOperator.id } });
    assert.equal(demotionRace.ok && assigned === assignmentOperator.id, false);
    assert.equal(assignmentUser.role === Role.VIEWER && (assignmentUser.pendingOfferTripId !== null || await db.tripOffer.count({ where: { operatorId: assignmentOperator.id, status: OfferStatus.OFFERED } }) > 0), false);

    // Demotion versus acceptance of an already outstanding offer.
    await db.user.updateMany({ where: { clerkId: { startsWith: run }, role: Role.OPERATOR }, data: { online: false } });
    const acceptanceOperator = await user(Role.OPERATOR, "acceptance-race", true); await profile(acceptanceOperator.id); await db.operatorDestination.create({ data: { operatorId: acceptanceOperator.id, destinationId: sharedDestination.id } });
    const acceptanceViewer = await user(Role.VIEWER, "acceptance-race-viewer"); const acceptanceTrip = await trip(acceptanceViewer.id, sharedDestination.id, "acceptance-race");
    await serial(tx => assignNextOperator(tx, acceptanceTrip.id));
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: acceptanceTrip.id } })).offeredOperatorId, acceptanceOperator.id);
    const [acceptanceDemotion, acceptance] = await Promise.all([returnOperatorToViewer(db, actor.id, acceptanceOperator.id), acceptTripOffer(db, acceptanceOperator.id, acceptanceTrip.id)]);
    const acceptanceUser = await db.user.findUniqueOrThrow({ where: { id: acceptanceOperator.id } });
    assert.equal(acceptanceDemotion.ok && acceptance.ok, false);
    assert.equal(acceptanceUser.role === Role.VIEWER && acceptanceUser.activeTripId !== null, false);

    // A disposable trigger forces audit failure after prior writes; everything rolls back.
    const rollback = await user(Role.VIEWER, "rollback", true); await profile(rollback.id, OperatorPilotStatus.APPROVED); await db.operatorDestination.create({ data: { operatorId: rollback.id, destinationId: sharedDestination.id } });
    await db.$executeRawUnsafe(`CREATE FUNCTION phase5c_force_audit_failure() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced Phase 5C audit failure'; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER phase5c_force_audit_failure BEFORE INSERT ON "AdminRoleChangeAudit" FOR EACH ROW EXECUTE FUNCTION phase5c_force_audit_failure()`); triggerInstalled = true;
    const failed = await assignViewerAsOperator(db, actor.id, rollback.id); assert.equal(failed.ok, false);
    const rollbackUser = await db.user.findUniqueOrThrow({ where: { id: rollback.id } }); assert.equal(rollbackUser.role, Role.VIEWER); assert.equal(rollbackUser.online, true);
    assert.equal((await db.operatorProfile.findUniqueOrThrow({ where: { userId: rollback.id } })).pilotStatus, OperatorPilotStatus.APPROVED);
    assert.equal(await db.operatorDestination.count({ where: { operatorId: rollback.id } }), 1); assert.equal(await audits(rollback.id), 0);
    await db.$executeRawUnsafe(`DROP TRIGGER phase5c_force_audit_failure ON "AdminRoleChangeAudit"`); await db.$executeRawUnsafe(`DROP FUNCTION phase5c_force_audit_failure()`); triggerInstalled = false;

    // Restrictive audit foreign keys preserve actor, target and audit history.
    const fkTarget = await user(Role.VIEWER, "fk-target"); assert.equal((await assignViewerAsOperator(db, actor.id, fkTarget.id)).ok, true);
    const fkAudit = await db.adminRoleChangeAudit.findFirstOrThrow({ where: { actorId: actor.id, targetId: fkTarget.id } });
    await assert.rejects(db.user.delete({ where: { id: actor.id } })); await assert.rejects(db.user.delete({ where: { id: fkTarget.id } }));
    assert.deepEqual(await db.adminRoleChangeAudit.findUniqueOrThrow({ where: { id: fkAudit.id } }), fkAudit);

    console.log("Phase 5C complete PostgreSQL integration assertions passed.");
  } finally {
    if (triggerInstalled) { await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS phase5c_force_audit_failure ON "AdminRoleChangeAudit"`); await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS phase5c_force_audit_failure()`); }
    await db.adminRoleChangeAudit.deleteMany({ where: { OR: [{ actor: { clerkId: { startsWith: run } } }, { target: { clerkId: { startsWith: run } } }] } });
    await db.trip.deleteMany({ where: { livekitRoom: { startsWith: run } } });
    await db.destination.deleteMany({ where: { slug: { startsWith: run } } });
    await db.user.deleteMany({ where: { clerkId: { startsWith: run } } });
    assert.equal(await db.adminRoleChangeAudit.count({ where: { OR: [{ actor: { clerkId: { startsWith: run } } }, { target: { clerkId: { startsWith: run } } }] } }), 0);
    assert.equal(await db.trip.count({ where: { livekitRoom: { startsWith: run } } }), 0);
    assert.equal(await db.destination.count({ where: { slug: { startsWith: run } } }), 0);
    assert.equal(await db.user.count({ where: { clerkId: { startsWith: run } } }), 0);
    const objects = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT (
        (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'phase5c_force_audit_failure') +
        (SELECT COUNT(*) FROM pg_proc WHERE proname = 'phase5c_force_audit_failure')
      )::bigint AS count
    `;
    assert.equal(Number(objects[0].count), 0);
    await db.$disconnect();
  }
}

void main().catch(error => { console.error(error instanceof Error ? error.message : "Phase 5C database integration failed"); process.exitCode = 1; });
