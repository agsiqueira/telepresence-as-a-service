import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AccountLifecycleAction, AccountStatus, OfferStatus, OperatorApplicationStatus, OperatorPilotStatus, PrismaClient, Role, TripStatus } from "@prisma/client";
import { deactivateAccount, reactivateAccount } from "../lib/account-lifecycle";

if (process.env.PHASE5E1_ACTIVE_SCHEMA !== "FULL" || process.env.PHASE5E1_CONFIRM_DISPOSABLE_DATABASE !== "YES_DELETE_PHASE5E1_TEST_DATA") throw new Error("Unsafe Phase 5E.1 integration mapping");
const db = new PrismaClient(); const run = `phase5e1-${randomUUID()}`;
async function user(suffix: string, role: Role, extra = {}) { return db.user.create({ data: { clerkId: `${run}-${suffix}`, name: suffix, role, ...extra } }); }
async function main() {
 try {
  const adminA = await user("admin-a", Role.ADMIN); const adminB = await user("admin-b", Role.ADMIN);
  const operator = await user("operator", Role.OPERATOR, { online: true });
  await db.operatorProfile.create({ data: { userId: operator.id, operatingArea: "Pilot City", serviceRadiusKm: 10, supportsCustom: false, languages: ["English"], accessibilityCapabilities: [], durationOptions: [30], pilotStatus: OperatorPilotStatus.APPROVED } });
  const application = await db.operatorApplication.create({ data: { applicantId: operator.id, qualifications: "Historical qualifications", relevantExperience: "Historical experience", languages: ["English"], availability: "Weekday afternoons", status: OperatorApplicationStatus.APPROVED, reviewedById: adminA.id, reviewedAt: new Date() } });

  let result = await deactivateAccount(db, adminA.id, operator.id, "  Pilot participation ended  ", new Date("2026-07-28T12:00:00Z"));
  assert.equal(result.ok, true); const deactivated = await db.user.findUniqueOrThrow({ where: { id: operator.id }, include: { operatorProfile: true } });
  assert.equal(deactivated.accountStatus, AccountStatus.DEACTIVATED); assert.equal(deactivated.online, false); assert.equal(deactivated.role, Role.OPERATOR); assert.equal(deactivated.operatorProfile?.pilotStatus, OperatorPilotStatus.APPROVED);
  assert.equal(await db.operatorApplication.count({ where: { id: application.id } }), 1);
  let audits = await db.accountLifecycleAudit.findMany({ where: { targetId: operator.id }, orderBy: { createdAt: "asc" } });
  assert.equal(audits.length, 1); assert.equal(audits[0].actorId, adminA.id); assert.equal(audits[0].action, AccountLifecycleAction.DEACTIVATE); assert.equal(audits[0].reason, "Pilot participation ended");
  assert.equal((await deactivateAccount(db, adminA.id, operator.id, "duplicate")).ok, false); assert.equal(await db.accountLifecycleAudit.count({ where: { targetId: operator.id } }), 1);

  result = await reactivateAccount(db, adminA.id, operator.id, "Appeal accepted"); assert.equal(result.ok, true);
  const reactivated = await db.user.findUniqueOrThrow({ where: { id: operator.id }, include: { operatorProfile: true } });
  assert.equal(reactivated.accountStatus, AccountStatus.ACTIVE); assert.equal(reactivated.online, false); assert.equal(reactivated.role, Role.OPERATOR); assert.equal(reactivated.operatorProfile?.pilotStatus, OperatorPilotStatus.APPROVED); assert.equal(reactivated.deactivatedAt, null);
  audits = await db.accountLifecycleAudit.findMany({ where: { targetId: operator.id } }); assert.equal(audits.length, 2);
  assert.equal((await reactivateAccount(db, adminA.id, operator.id, "duplicate")).ok, false); assert.equal(await db.accountLifecycleAudit.count({ where: { targetId: operator.id } }), 2);

  const self = await deactivateAccount(db, adminA.id, adminA.id, "self"); assert.equal(self.ok, false); if (!self.ok) assert.equal(self.code, "SELF_DEACTIVATION_FORBIDDEN");

  const blocked = await user("blocked", Role.VIEWER);
  const trip = await db.trip.create({ data: { viewerId: blocked.id, destination: "Blocking visit", livekitRoom: `${run}-blocking`, status: TripStatus.REQUESTED } });
  let blockedResult = await deactivateAccount(db, adminA.id, blocked.id, "blocked"); assert.equal(blockedResult.ok, false); if (!blockedResult.ok) assert.equal(blockedResult.code, "ACTIVE_ACCOUNT_OBLIGATION");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: blocked.id } })).accountStatus, AccountStatus.ACTIVE); assert.equal(await db.accountLifecycleAudit.count({ where: { targetId: blocked.id } }), 0);
  await db.trip.update({ where: { id: trip.id }, data: { status: TripStatus.CANCELLED } });
  await db.user.update({ where: { id: blocked.id }, data: { pendingOfferTripId: "reservation" } });
  blockedResult = await deactivateAccount(db, adminA.id, blocked.id, "blocked pointer"); assert.equal(blockedResult.ok, false); if (!blockedResult.ok) assert.equal(blockedResult.code, "ACTIVE_ACCOUNT_OBLIGATION");
  await db.user.update({ where: { id: blocked.id }, data: { pendingOfferTripId: null } });

  await db.$executeRawUnsafe(`CREATE FUNCTION phase5e1_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected lifecycle audit failure'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER phase5e1_fail_audit BEFORE INSERT ON "AccountLifecycleAudit" FOR EACH ROW EXECUTE FUNCTION phase5e1_fail_audit()`);
  const originalError = console.error; console.error = () => undefined;
  const rollback = await deactivateAccount(db, adminA.id, blocked.id, "rollback"); console.error = originalError;
  assert.equal(rollback.ok, false); assert.equal((await db.user.findUniqueOrThrow({ where: { id: blocked.id } })).accountStatus, AccountStatus.ACTIVE); assert.equal(await db.accountLifecycleAudit.count({ where: { targetId: blocked.id } }), 0);
  await db.$executeRawUnsafe(`DROP TRIGGER phase5e1_fail_audit ON "AccountLifecycleAudit"`); await db.$executeRawUnsafe(`DROP FUNCTION phase5e1_fail_audit()`);

  const concurrent = await Promise.all([deactivateAccount(db, adminA.id, adminB.id, "concurrent A"), deactivateAccount(db, adminB.id, adminA.id, "concurrent B")]);
  assert.equal(concurrent.filter(value => value.ok).length, 1);
  const activeAdmins = await db.user.count({ where: { clerkId: { startsWith: run }, role: Role.ADMIN, accountStatus: AccountStatus.ACTIVE } }); assert.equal(activeAdmins, 1);
  assert.equal(await db.accountLifecycleAudit.count({ where: { target: { clerkId: { startsWith: `${run}-admin` } } } }), 1);
  console.log("Phase 5E.1A PostgreSQL lifecycle integration assertions passed.");
 } finally {
  await db.accountLifecycleAudit.deleteMany({ where: { OR: [{ actor: { clerkId: { startsWith: run } } }, { target: { clerkId: { startsWith: run } } }] } });
  await db.operatorApplication.deleteMany({ where: { applicant: { clerkId: { startsWith: run } } } });
  await db.tripOffer.deleteMany({ where: { operator: { clerkId: { startsWith: run } } } });
  await db.trip.deleteMany({ where: { viewer: { clerkId: { startsWith: run } } } });
  await db.operatorDestination.deleteMany({ where: { operator: { clerkId: { startsWith: run } } } });
  await db.operatorProfile.deleteMany({ where: { user: { clerkId: { startsWith: run } } } });
  await db.user.deleteMany({ where: { clerkId: { startsWith: run } } });
  assert.equal(await db.user.count({ where: { clerkId: { startsWith: run } } }), 0); await db.$disconnect();
 }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Phase 5E.1 database integration failed"); process.exitCode = 1; });
