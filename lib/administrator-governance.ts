import "server-only";

import { AccountStatus, AdminRoleChangeAction, OfferStatus, OperatorApplicationStatus, Prisma, Role, TripStatus, type PrismaClient } from "@prisma/client";

const MAX_SERIALIZABLE_ATTEMPTS = 3;
export const ADMIN_GOVERNANCE_REASON_MAX_LENGTH = 500;
type Operation = "assign-admin" | "remove-admin";
type Database = Pick<PrismaClient, "$transaction">;

export type AdministratorGovernanceFailureCode =
  | "UNAUTHORIZED" | "ACTOR_NOT_FOUND" | "ACTOR_NOT_ACTIVE_ADMIN" | "TARGET_NOT_FOUND"
  | "SELF_GOVERNANCE_FORBIDDEN" | "TARGET_INACTIVE" | "INVALID_CURRENT_ROLE"
  | "LAST_ACTIVE_ADMIN" | "ACTIVE_ACCOUNT_OBLIGATION" | "PENDING_OPERATOR_APPLICATION_EXISTS"
  | "INVALID_REASON" | "SERIALIZATION_RETRY_EXHAUSTED" | "INTERNAL_INVARIANT_FAILURE";
export type AdministratorGovernanceFailure = { ok: false; code: AdministratorGovernanceFailureCode; status: 400 | 401 | 403 | 404 | 409 | 500 | 503; error: string };
export type AdministratorGovernanceSuccess = { ok: true; value: { targetId: string; previousRole: Role; newRole: Role; accountStatus: AccountStatus; auditId: string } };
export type AdministratorGovernanceResult = AdministratorGovernanceFailure | AdministratorGovernanceSuccess;

class GovernanceAbort extends Error { constructor(readonly failure: AdministratorGovernanceFailure) { super(failure.code); } }
const failure = (code: AdministratorGovernanceFailureCode, status: AdministratorGovernanceFailure["status"], error: string): AdministratorGovernanceFailure => ({ ok: false, code, status, error });
function abort(code: AdministratorGovernanceFailureCode, status: AdministratorGovernanceFailure["status"], error: string): never { throw new GovernanceAbort(failure(code, status, error)); }
function normalizeReason(reason: unknown) { if (typeof reason !== "string") return null; const value = reason.trim().replace(/\s+/g, " "); return value.length >= 1 && value.length <= ADMIN_GOVERNANCE_REASON_MAX_LENGTH ? value : null; }
function isSerializableConflict(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"; }

async function runGovernance(db: Database, operation: Operation, targetId: string, work: (tx: Prisma.TransactionClient) => Promise<AdministratorGovernanceSuccess>): Promise<AdministratorGovernanceResult> {
  let sawSerializationConflict = false;
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (error instanceof GovernanceAbort) {
        if (sawSerializationConflict && error.failure.code === "ACTOR_NOT_ACTIVE_ADMIN") return failure("INVALID_CURRENT_ROLE", 409, "Administrator governance state changed concurrently");
        return error.failure;
      }
      if (isSerializableConflict(error)) { sawSerializationConflict = true; if (attempt < MAX_SERIALIZABLE_ATTEMPTS) continue; return failure("SERIALIZATION_RETRY_EXHAUSTED", 503, "Administrator governance changed repeatedly; try again"); }
      console.error("Unexpected administrator governance failure", { operation, targetId }, error);
      return failure("INTERNAL_INVARIANT_FAILURE", 500, "Administrator governance could not be updated");
    }
  }
  return failure("INTERNAL_INVARIANT_FAILURE", 500, "Administrator governance could not be updated");
}

async function authorizeActor(tx: Prisma.TransactionClient, actorId: string | null | undefined, targetId: string) {
  if (!actorId) abort("UNAUTHORIZED", 401, "Authentication is required");
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true, accountStatus: true } });
  if (!actor) abort("ACTOR_NOT_FOUND", 404, "Administrator not found");
  if (actor.role !== Role.ADMIN || actor.accountStatus !== AccountStatus.ACTIVE) abort("ACTOR_NOT_ACTIVE_ADMIN", 403, "Active administrator authorization is required");
  if (actor.id === targetId) abort("SELF_GOVERNANCE_FORBIDDEN", 403, "Administrators cannot change their own administrator role");
  return actor;
}

async function hasOperationalObligation(tx: Prisma.TransactionClient, target: { id: string; pendingOfferTripId: string | null; activeTripId: string | null }) {
  if (target.pendingOfferTripId || target.activeTripId) return true;
  const [viewerTrips, operatorTrips, offeredTrips, offers] = await Promise.all([
    tx.trip.count({ where: { viewerId: target.id, status: { in: [TripStatus.REQUESTED, TripStatus.OFFERED, TripStatus.ACCEPTED, TripStatus.IN_PROGRESS, TripStatus.ENDED] } } }),
    tx.trip.count({ where: { operatorId: target.id, status: { in: [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS] } } }),
    tx.trip.count({ where: { offeredOperatorId: target.id, status: TripStatus.OFFERED } }),
    tx.tripOffer.count({ where: { operatorId: target.id, status: OfferStatus.OFFERED } }),
  ]);
  return viewerTrips + operatorTrips + offeredTrips + offers > 0;
}

export async function assignAdministrator(db: Database, actorId: string | null | undefined, targetId: string, reason: unknown): Promise<AdministratorGovernanceResult> {
  const normalizedReason = normalizeReason(reason); if (!normalizedReason) return failure("INVALID_REASON", 400, `Reason must be between 1 and ${ADMIN_GOVERNANCE_REASON_MAX_LENGTH} characters`);
  return runGovernance(db, "assign-admin", targetId, async tx => {
    const actor = await authorizeActor(tx, actorId, targetId);
    const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, accountStatus: true, pendingOfferTripId: true, activeTripId: true } });
    if (!target) abort("TARGET_NOT_FOUND", 404, "Participant not found");
    if (target.accountStatus !== AccountStatus.ACTIVE) abort("TARGET_INACTIVE", 409, "Participant must be active before administrator assignment");
    if (target.role !== Role.VIEWER && target.role !== Role.OPERATOR) abort("INVALID_CURRENT_ROLE", 409, "Participant role no longer supports administrator assignment");
    if (await hasOperationalObligation(tx, target)) abort("ACTIVE_ACCOUNT_OBLIGATION", 409, "Participant has unfinished visit or marketplace activity");
    if (await tx.operatorApplication.count({ where: { applicantId: target.id, status: OperatorApplicationStatus.PENDING } })) abort("PENDING_OPERATOR_APPLICATION_EXISTS", 409, "Resolve the pending Operator application before administrator assignment");
    const changed = await tx.user.updateMany({ where: { id: target.id, role: target.role, accountStatus: AccountStatus.ACTIVE, pendingOfferTripId: null, activeTripId: null }, data: { role: Role.ADMIN, online: false } });
    if (changed.count !== 1) abort("INVALID_CURRENT_ROLE", 409, "Participant state changed concurrently");
    const audit = await tx.adminRoleChangeAudit.create({ data: { actorId: actor.id, targetId: target.id, action: AdminRoleChangeAction.ASSIGN_ADMIN, previousRole: target.role, newRole: Role.ADMIN, reason: normalizedReason }, select: { id: true } });
    return { ok: true, value: { targetId: target.id, previousRole: target.role, newRole: Role.ADMIN, accountStatus: target.accountStatus, auditId: audit.id } };
  });
}

export async function removeAdministrator(db: Database, actorId: string | null | undefined, targetId: string, reason: unknown): Promise<AdministratorGovernanceResult> {
  const normalizedReason = normalizeReason(reason); if (!normalizedReason) return failure("INVALID_REASON", 400, `Reason must be between 1 and ${ADMIN_GOVERNANCE_REASON_MAX_LENGTH} characters`);
  return runGovernance(db, "remove-admin", targetId, async tx => {
    const actor = await authorizeActor(tx, actorId, targetId);
    const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, accountStatus: true, pendingOfferTripId: true, activeTripId: true } });
    if (!target) abort("TARGET_NOT_FOUND", 404, "Participant not found");
    if (target.role !== Role.ADMIN) abort("INVALID_CURRENT_ROLE", 409, "Participant is no longer an administrator");
    if (await hasOperationalObligation(tx, target)) abort("ACTIVE_ACCOUNT_OBLIGATION", 409, "Participant has unfinished visit or marketplace activity");
    if (target.accountStatus === AccountStatus.ACTIVE) {
      const otherActiveAdmins = await tx.user.count({ where: { id: { not: target.id }, role: Role.ADMIN, accountStatus: AccountStatus.ACTIVE } });
      if (otherActiveAdmins < 1) abort("LAST_ACTIVE_ADMIN", 409, "The last active administrator cannot be removed");
    }
    const changed = await tx.user.updateMany({ where: { id: target.id, role: Role.ADMIN, accountStatus: target.accountStatus, pendingOfferTripId: null, activeTripId: null }, data: { role: Role.VIEWER, online: false } });
    if (changed.count !== 1) abort("INVALID_CURRENT_ROLE", 409, "Participant state changed concurrently");
    const audit = await tx.adminRoleChangeAudit.create({ data: { actorId: actor.id, targetId: target.id, action: AdminRoleChangeAction.REMOVE_ADMIN, previousRole: Role.ADMIN, newRole: Role.VIEWER, reason: normalizedReason }, select: { id: true } });
    return { ok: true, value: { targetId: target.id, previousRole: Role.ADMIN, newRole: Role.VIEWER, accountStatus: target.accountStatus, auditId: audit.id } };
  });
}
