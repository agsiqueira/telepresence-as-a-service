import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AccountStatus, AdminRoleChangeAction, OfferStatus, OperatorApplicationStatus, OperatorPilotStatus, PrismaClient, Role, TripStatus } from "@prisma/client";
import { assignAdministrator, removeAdministrator } from "../lib/administrator-governance";
if (process.env.PHASE5E2_ACTIVE_SCHEMA !== "FULL" || process.env.PHASE5E2_CONFIRM_DISPOSABLE_DATABASE !== "YES_DELETE_PHASE5E2_TEST_DATA") throw new Error("Unsafe Phase 5E.2 integration mapping");
const db = new PrismaClient(); const run = `phase5e2-${randomUUID()}`;
async function user(suffix: string, role: Role, extra = {}) { return db.user.create({ data: { clerkId: `${run}-${suffix}`, name: suffix, role, ...extra } }); }
async function expectCode(promise: ReturnType<typeof assignAdministrator>, code: string) { const result = await promise; assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, code); }
async function main() {
  try {
    const crossA = await user("cross-a", Role.ADMIN), crossB = await user("cross-b", Role.ADMIN);
    const concurrent = await Promise.all([removeAdministrator(db, crossA.id, crossB.id, "Remove B"), removeAdministrator(db, crossB.id, crossA.id, "Remove A")]);
    assert.equal(concurrent.filter(value => value.ok).length, 1); assert.equal(await db.user.count({ where: { clerkId: { startsWith: run }, role: Role.ADMIN, accountStatus: AccountStatus.ACTIVE } }), 1);
    const losing = concurrent.find(value => !value.ok); assert.ok(losing && !losing.ok); if (!losing.ok) assert.equal(["LAST_ACTIVE_ADMIN", "INVALID_CURRENT_ROLE"].includes(losing.code), true);
    const remaining = await db.user.findFirstOrThrow({ where: { clerkId: { startsWith: run }, role: Role.ADMIN } });
    await expectCode(removeAdministrator(db, remaining.id, remaining.id, "self"), "SELF_GOVERNANCE_FORBIDDEN");

    const admin = await user("admin", Role.ADMIN), secondAdmin = await user("admin-second", Role.ADMIN);
    const viewer = await user("viewer", Role.VIEWER, { online: true });
    await expectCode(assignAdministrator(db, viewer.id, secondAdmin.id, "wrong role"), "ACTOR_NOT_ACTIVE_ADMIN"); await expectCode(assignAdministrator(db, "missing-actor", viewer.id, "missing actor"), "ACTOR_NOT_FOUND");
    let result = await assignAdministrator(db, admin.id, viewer.id, "  Governance   appointment  "); assert.equal(result.ok, true);
    let stored = await db.user.findUniqueOrThrow({ where: { id: viewer.id } }); assert.equal(stored.role, Role.ADMIN); assert.equal(stored.online, false);
    let audit = await db.adminRoleChangeAudit.findFirstOrThrow({ where: { targetId: viewer.id, action: AdminRoleChangeAction.ASSIGN_ADMIN } }); assert.equal(audit.reason, "Governance appointment"); assert.equal(audit.previousRole, Role.VIEWER); assert.equal(audit.newRole, Role.ADMIN);
    await expectCode(assignAdministrator(db, admin.id, viewer.id, "duplicate"), "INVALID_CURRENT_ROLE");

    const operator = await user("operator", Role.OPERATOR, { online: true });
    const profile = await db.operatorProfile.create({ data: { userId: operator.id, operatingArea: "Pilot City", serviceRadiusKm: 10, supportsCustom: false, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30], pilotStatus: OperatorPilotStatus.APPROVED } });
    const destination = await db.destination.create({ data: { slug: `${run}-destination`, name: "Governance destination", shortDescription: "Validation", city: "Pilot City", meetingArea: "Entrance", category: "Test", durationOptions: [30] } });
    await db.operatorDestination.create({ data: { operatorId: operator.id, destinationId: destination.id } });
    const preservedViewer = await user("preserved-viewer", Role.VIEWER); const preservedTrip = await db.trip.create({ data: { viewerId: preservedViewer.id, operatorId: operator.id, destination: "Historical", livekitRoom: `${run}-historical`, status: TripStatus.FEEDBACK_COMPLETED } });
    const preservedApplication = await db.operatorApplication.create({ data: { applicantId: operator.id, qualifications: "Historical qualifications", relevantExperience: "Historical experience", languages: ["English"], availability: "Weekdays", status: OperatorApplicationStatus.APPROVED, reviewedById: admin.id, reviewedAt: new Date() } });
    const preservedAudit = await db.adminRoleChangeAudit.create({ data: { actorId: admin.id, targetId: operator.id, action: AdminRoleChangeAction.ASSIGN_OPERATOR, previousRole: Role.VIEWER, newRole: Role.OPERATOR } });
    result = await assignAdministrator(db, admin.id, operator.id, "Operator appointment"); assert.equal(result.ok, true);
    stored = await db.user.findUniqueOrThrow({ where: { id: operator.id } }); assert.equal(stored.role, Role.ADMIN); assert.equal(stored.online, false);
    assert.equal(await db.operatorProfile.count({ where: { id: profile.id, pilotStatus: OperatorPilotStatus.APPROVED } }), 1); assert.equal(await db.operatorDestination.count({ where: { operatorId: operator.id, destinationId: destination.id } }), 1);
    assert.equal(await db.operatorApplication.count({ where: { id: preservedApplication.id, status: OperatorApplicationStatus.APPROVED } }), 1); assert.equal(await db.trip.count({ where: { id: preservedTrip.id, status: TripStatus.FEEDBACK_COMPLETED } }), 1); assert.equal(await db.adminRoleChangeAudit.count({ where: { id: preservedAudit.id } }), 1);

    const inactiveViewer = await user("inactive-viewer", Role.VIEWER, { accountStatus: AccountStatus.DEACTIVATED, deactivatedAt: new Date() });
    await expectCode(assignAdministrator(db, admin.id, inactiveViewer.id, "inactive"), "TARGET_INACTIVE");
    const pendingViewer = await user("pending-viewer", Role.VIEWER); await db.operatorApplication.create({ data: { applicantId: pendingViewer.id, qualifications: "Qualifications", relevantExperience: "Experience", languages: ["English"], availability: "Weekdays", status: OperatorApplicationStatus.PENDING } });
    await expectCode(assignAdministrator(db, admin.id, pendingViewer.id, "pending"), "PENDING_OPERATOR_APPLICATION_EXISTS");

    const blocked = await user("blocked", Role.VIEWER); const trip = await db.trip.create({ data: { viewerId: blocked.id, destination: "Blocking", livekitRoom: `${run}-blocking`, status: TripStatus.REQUESTED } });
    await expectCode(assignAdministrator(db, admin.id, blocked.id, "blocked"), "ACTIVE_ACCOUNT_OBLIGATION"); await db.trip.update({ where: { id: trip.id }, data: { status: TripStatus.CANCELLED } });
    await db.user.update({ where: { id: blocked.id }, data: { pendingOfferTripId: "reservation" } }); await expectCode(assignAdministrator(db, admin.id, blocked.id, "pointer"), "ACTIVE_ACCOUNT_OBLIGATION"); await db.user.update({ where: { id: blocked.id }, data: { pendingOfferTripId: null } });
    await db.user.update({ where: { id: blocked.id }, data: { activeTripId: "active-reservation" } }); await expectCode(assignAdministrator(db, admin.id, blocked.id, "active pointer"), "ACTIVE_ACCOUNT_OBLIGATION"); await db.user.update({ where: { id: blocked.id }, data: { activeTripId: null } });
    const offerTarget = await user("offer-target", Role.OPERATOR); const offerViewer = await user("offer-viewer", Role.VIEWER); const offeredTrip = await db.trip.create({ data: { viewerId: offerViewer.id, offeredOperatorId: offerTarget.id, destination: "Offer", livekitRoom: `${run}-offer`, status: TripStatus.OFFERED } }); await db.tripOffer.create({ data: { tripId: offeredTrip.id, operatorId: offerTarget.id, status: OfferStatus.OFFERED, expiresAt: new Date(Date.now() + 60000) } });
    await expectCode(assignAdministrator(db, admin.id, offerTarget.id, "offer"), "ACTIVE_ACCOUNT_OBLIGATION");
    const activeOperator = await user("active-operator", Role.OPERATOR); const activeViewer = await user("active-viewer", Role.VIEWER); await db.trip.create({ data: { viewerId: activeViewer.id, operatorId: activeOperator.id, destination: "Accepted", livekitRoom: `${run}-accepted`, status: TripStatus.ACCEPTED } }); await expectCode(assignAdministrator(db, admin.id, activeOperator.id, "accepted"), "ACTIVE_ACCOUNT_OBLIGATION");
    const offeredOnly = await user("offered-only", Role.OPERATOR); const offeredOnlyViewer = await user("offered-only-viewer", Role.VIEWER); await db.trip.create({ data: { viewerId: offeredOnlyViewer.id, offeredOperatorId: offeredOnly.id, destination: "Offered only", livekitRoom: `${run}-offered-only`, status: TripStatus.OFFERED } }); await expectCode(assignAdministrator(db, admin.id, offeredOnly.id, "offered relationship"), "ACTIVE_ACCOUNT_OBLIGATION");
    const offerOnly = await user("offer-only", Role.OPERATOR); const offerOnlyViewer = await user("offer-only-viewer", Role.VIEWER); const offerOnlyTrip = await db.trip.create({ data: { viewerId: offerOnlyViewer.id, destination: "Offer record", livekitRoom: `${run}-offer-record`, status: TripStatus.REQUESTED } }); await db.tripOffer.create({ data: { tripId: offerOnlyTrip.id, operatorId: offerOnly.id, status: OfferStatus.OFFERED, expiresAt: new Date(Date.now() + 60000) } }); await expectCode(assignAdministrator(db, admin.id, offerOnly.id, "offer record"), "ACTIVE_ACCOUNT_OBLIGATION");

    const inactiveAdmin = await user("inactive-admin", Role.ADMIN, { accountStatus: AccountStatus.DEACTIVATED, deactivatedAt: new Date(), online: true });
    result = await removeAdministrator(db, admin.id, inactiveAdmin.id, "Remove inactive administrator"); assert.equal(result.ok, true); stored = await db.user.findUniqueOrThrow({ where: { id: inactiveAdmin.id } }); assert.equal(stored.role, Role.VIEWER); assert.equal(stored.accountStatus, AccountStatus.DEACTIVATED); assert.equal(stored.online, false);
    await expectCode(removeAdministrator(db, admin.id, inactiveAdmin.id, "duplicate"), "INVALID_CURRENT_ROLE");

    const inactiveActor = await user("inactive-actor", Role.ADMIN, { accountStatus: AccountStatus.DEACTIVATED, deactivatedAt: new Date() }); const target = await user("target", Role.VIEWER);
    await expectCode(assignAdministrator(db, inactiveActor.id, target.id, "actor inactive"), "ACTOR_NOT_ACTIVE_ADMIN");

    await db.$executeRawUnsafe(`CREATE FUNCTION phase5e2_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected governance audit failure'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER phase5e2_fail_audit BEFORE INSERT ON "AdminRoleChangeAudit" FOR EACH ROW EXECUTE FUNCTION phase5e2_fail_audit()`);
    const rollbackTarget = await user("rollback", Role.VIEWER); const originalError = console.error; console.error = () => undefined; const rollback = await assignAdministrator(db, admin.id, rollbackTarget.id, "rollback"); console.error = originalError;
    assert.equal(rollback.ok, false); assert.equal((await db.user.findUniqueOrThrow({ where: { id: rollbackTarget.id } })).role, Role.VIEWER); assert.equal(await db.adminRoleChangeAudit.count({ where: { targetId: rollbackTarget.id } }), 0);
    await db.$executeRawUnsafe(`DROP TRIGGER phase5e2_fail_audit ON "AdminRoleChangeAudit"`); await db.$executeRawUnsafe(`DROP FUNCTION phase5e2_fail_audit()`);

    async function rejected(sql: string) { let failed = false; try { await db.$executeRawUnsafe(sql); } catch { failed = true; } assert.equal(failed, true); }
    await rejected(`INSERT INTO "AdminRoleChangeAudit" ("id","actorId","targetId","action","previousRole","newRole","reason","createdAt") VALUES ('${run}-invalid-pair','${admin.id}','${secondAdmin.id}','ASSIGN_ADMIN','ADMIN','VIEWER','reason',CURRENT_TIMESTAMP)`);
    await rejected(`INSERT INTO "AdminRoleChangeAudit" ("id","actorId","targetId","action","previousRole","newRole","reason","createdAt") VALUES ('${run}-invalid-reason','${admin.id}','${secondAdmin.id}','REMOVE_ADMIN','ADMIN','VIEWER',' untrimmed ',CURRENT_TIMESTAMP)`);
    await rejected(`INSERT INTO "AdminRoleChangeAudit" ("id","actorId","targetId","action","previousRole","newRole","reason","createdAt") VALUES ('${run}-missing-reason','${admin.id}','${secondAdmin.id}','REMOVE_ADMIN','ADMIN','VIEWER',NULL,CURRENT_TIMESTAMP)`);
    await rejected(`INSERT INTO "AdminRoleChangeAudit" ("id","actorId","targetId","action","previousRole","newRole","reason","createdAt") VALUES ('${run}-long-reason','${admin.id}','${secondAdmin.id}','REMOVE_ADMIN','ADMIN','VIEWER','${"x".repeat(501)}',CURRENT_TIMESTAMP)`);
    console.log("Phase 5E.2A PostgreSQL administrator-governance assertions passed.");
  } finally {
    await db.adminRoleChangeAudit.deleteMany({ where: { OR: [{ actor: { clerkId: { startsWith: run } } }, { target: { clerkId: { startsWith: run } } }] } });
    await db.accountLifecycleAudit.deleteMany({ where: { OR: [{ actor: { clerkId: { startsWith: run } } }, { target: { clerkId: { startsWith: run } } }] } });
    await db.operatorApplication.deleteMany({ where: { applicant: { clerkId: { startsWith: run } } } }); await db.tripOffer.deleteMany({ where: { operator: { clerkId: { startsWith: run } } } }); await db.trip.deleteMany({ where: { viewer: { clerkId: { startsWith: run } } } }); await db.operatorDestination.deleteMany({ where: { operator: { clerkId: { startsWith: run } } } }); await db.operatorProfile.deleteMany({ where: { user: { clerkId: { startsWith: run } } } }); await db.destination.deleteMany({ where: { slug: { startsWith: run } } }); await db.user.deleteMany({ where: { clerkId: { startsWith: run } } }); assert.equal(await db.user.count({ where: { clerkId: { startsWith: run } } }), 0); await db.$disconnect();
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Phase 5E.2 database integration failed"); process.exitCode = 1; });
