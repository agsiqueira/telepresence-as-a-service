import "server-only";

import {
  AccountLifecycleAction,
  AccountStatus,
  OfferStatus,
  Prisma,
  Role,
  TripStatus,
  type PrismaClient,
} from "@prisma/client";

const MAX_SERIALIZABLE_ATTEMPTS = 3;
export const ACCOUNT_LIFECYCLE_REASON_MAX_LENGTH = 500;

export type AccountLifecycleFailureCode =
  | "UNAUTHORIZED"
  | "ACTOR_NOT_FOUND"
  | "ACTOR_INACTIVE"
  | "FORBIDDEN"
  | "TARGET_NOT_FOUND"
  | "SELF_DEACTIVATION_FORBIDDEN"
  | "INVALID_REASON"
  | "ACCOUNT_ALREADY_ACTIVE"
  | "ACCOUNT_ALREADY_DEACTIVATED"
  | "LAST_ACTIVE_ADMIN"
  | "ACTIVE_ACCOUNT_OBLIGATION"
  | "SERIALIZATION_RETRY_EXHAUSTED"
  | "INTERNAL_INVARIANT_FAILURE";

export type AccountLifecycleFailure = {
  ok: false;
  code: AccountLifecycleFailureCode;
  status: 400 | 401 | 403 | 404 | 409 | 500 | 503;
  error: string;
};

export type AccountLifecycleSuccess = {
  ok: true;
  value: {
    targetId: string;
    previousStatus: AccountStatus;
    newStatus: AccountStatus;
    auditId: string;
    deactivatedAt: Date | null;
  };
};

export type AccountLifecycleResult = AccountLifecycleSuccess | AccountLifecycleFailure;
type Database = Pick<PrismaClient, "$transaction">;
type Operation = "deactivate" | "reactivate";

class AccountLifecycleAbort extends Error {
  constructor(readonly failure: AccountLifecycleFailure) {
    super(failure.code);
  }
}

const failure = (
  code: AccountLifecycleFailureCode,
  status: AccountLifecycleFailure["status"],
  error: string
): AccountLifecycleFailure => ({ ok: false, code, status, error });

function abort(code: AccountLifecycleFailureCode, status: AccountLifecycleFailure["status"], error: string): never {
  throw new AccountLifecycleAbort(failure(code, status, error));
}

function normalizeReason(reason: unknown) {
  if (typeof reason !== "string") return null;
  const normalized = reason.trim().replace(/\s+/g, " ");
  return normalized.length >= 1 && normalized.length <= ACCOUNT_LIFECYCLE_REASON_MAX_LENGTH
    ? normalized
    : null;
}

function isSerializableConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function runLifecycleTransition(
  db: Database,
  operation: Operation,
  targetId: string,
  work: (tx: Prisma.TransactionClient) => Promise<AccountLifecycleSuccess>
): Promise<AccountLifecycleResult> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AccountLifecycleAbort) return error.failure;
      if (isSerializableConflict(error)) {
        if (attempt < MAX_SERIALIZABLE_ATTEMPTS) continue;
        return failure("SERIALIZATION_RETRY_EXHAUSTED", 503, "Account state changed repeatedly; try again");
      }
      console.error("Unexpected account lifecycle failure", { operation, targetId }, error);
      return failure("INTERNAL_INVARIANT_FAILURE", 500, "Account lifecycle could not be updated");
    }
  }
  return failure("INTERNAL_INVARIANT_FAILURE", 500, "Account lifecycle could not be updated");
}

async function authorizeActiveAdmin(tx: Prisma.TransactionClient, actorId: string | null | undefined) {
  if (!actorId) abort("UNAUTHORIZED", 401, "Authentication is required");
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true, accountStatus: true },
  });
  if (!actor) abort("ACTOR_NOT_FOUND", 404, "Administrator not found");
  if (actor.accountStatus !== AccountStatus.ACTIVE) abort("ACTOR_INACTIVE", 403, "Administrator account is not active");
  if (actor.role !== Role.ADMIN) abort("FORBIDDEN", 403, "Administrator authorization is required");
  return actor;
}

async function hasBlockingObligation(tx: Prisma.TransactionClient, target: { id: string; pendingOfferTripId: string | null; activeTripId: string | null }) {
  if (target.pendingOfferTripId || target.activeTripId) return true;
  const [viewerTrips, operatorTrips, offeredTrips, pendingOffers] = await Promise.all([
    tx.trip.count({
      where: {
        viewerId: target.id,
        status: { in: [TripStatus.REQUESTED, TripStatus.OFFERED, TripStatus.ACCEPTED, TripStatus.IN_PROGRESS, TripStatus.ENDED] },
      },
    }),
    tx.trip.count({
      where: { operatorId: target.id, status: { in: [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS] } },
    }),
    tx.trip.count({
      where: { offeredOperatorId: target.id, status: TripStatus.OFFERED },
    }),
    tx.tripOffer.count({ where: { operatorId: target.id, status: OfferStatus.OFFERED } }),
  ]);
  return viewerTrips + operatorTrips + offeredTrips + pendingOffers > 0;
}

export async function deactivateAccount(
  db: Database,
  actorId: string | null | undefined,
  targetId: string,
  reason: unknown,
  now = new Date()
): Promise<AccountLifecycleResult> {
  const normalizedReason = normalizeReason(reason);
  if (!normalizedReason) return failure("INVALID_REASON", 400, `Reason must be between 1 and ${ACCOUNT_LIFECYCLE_REASON_MAX_LENGTH} characters`);
  return runLifecycleTransition(db, "deactivate", targetId, async tx => {
    const actor = await authorizeActiveAdmin(tx, actorId);
    if (actor.id === targetId) abort("SELF_DEACTIVATION_FORBIDDEN", 403, "Administrators cannot deactivate themselves");
    const target = await tx.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, accountStatus: true, pendingOfferTripId: true, activeTripId: true },
    });
    if (!target) abort("TARGET_NOT_FOUND", 404, "Account not found");
    if (target.accountStatus !== AccountStatus.ACTIVE) abort("ACCOUNT_ALREADY_DEACTIVATED", 409, "Account is already deactivated");
    if (target.role === Role.ADMIN) {
      const otherActiveAdmins = await tx.user.count({
        where: { id: { not: target.id }, role: Role.ADMIN, accountStatus: AccountStatus.ACTIVE },
      });
      if (otherActiveAdmins < 1) abort("LAST_ACTIVE_ADMIN", 409, "The last active administrator cannot be deactivated");
    }
    if (await hasBlockingObligation(tx, target)) {
      abort("ACTIVE_ACCOUNT_OBLIGATION", 409, "Account has unfinished visit or marketplace activity");
    }
    const changed = await tx.user.updateMany({
      where: {
        id: target.id,
        accountStatus: AccountStatus.ACTIVE,
        pendingOfferTripId: null,
        activeTripId: null,
      },
      data: { accountStatus: AccountStatus.DEACTIVATED, deactivatedAt: now, online: false },
    });
    if (changed.count !== 1) abort("INTERNAL_INVARIANT_FAILURE", 409, "Account state changed concurrently");
    const audit = await tx.accountLifecycleAudit.create({
      data: {
        actorId: actor.id,
        targetId: target.id,
        action: AccountLifecycleAction.DEACTIVATE,
        previousStatus: AccountStatus.ACTIVE,
        newStatus: AccountStatus.DEACTIVATED,
        reason: normalizedReason,
      },
      select: { id: true },
    });
    return {
      ok: true,
      value: {
        targetId: target.id,
        previousStatus: AccountStatus.ACTIVE,
        newStatus: AccountStatus.DEACTIVATED,
        auditId: audit.id,
        deactivatedAt: now,
      },
    };
  });
}

export async function reactivateAccount(
  db: Database,
  actorId: string | null | undefined,
  targetId: string,
  reason: unknown
): Promise<AccountLifecycleResult> {
  const normalizedReason = normalizeReason(reason);
  if (!normalizedReason) return failure("INVALID_REASON", 400, `Reason must be between 1 and ${ACCOUNT_LIFECYCLE_REASON_MAX_LENGTH} characters`);
  return runLifecycleTransition(db, "reactivate", targetId, async tx => {
    const actor = await authorizeActiveAdmin(tx, actorId);
    const target = await tx.user.findUnique({
      where: { id: targetId },
      select: { id: true, accountStatus: true },
    });
    if (!target) abort("TARGET_NOT_FOUND", 404, "Account not found");
    if (target.accountStatus !== AccountStatus.DEACTIVATED) abort("ACCOUNT_ALREADY_ACTIVE", 409, "Account is already active");
    const changed = await tx.user.updateMany({
      where: { id: target.id, accountStatus: AccountStatus.DEACTIVATED },
      data: { accountStatus: AccountStatus.ACTIVE, deactivatedAt: null, online: false },
    });
    if (changed.count !== 1) abort("INTERNAL_INVARIANT_FAILURE", 409, "Account state changed concurrently");
    const audit = await tx.accountLifecycleAudit.create({
      data: {
        actorId: actor.id,
        targetId: target.id,
        action: AccountLifecycleAction.REACTIVATE,
        previousStatus: AccountStatus.DEACTIVATED,
        newStatus: AccountStatus.ACTIVE,
        reason: normalizedReason,
      },
      select: { id: true },
    });
    return {
      ok: true,
      value: {
        targetId: target.id,
        previousStatus: AccountStatus.DEACTIVATED,
        newStatus: AccountStatus.ACTIVE,
        auditId: audit.id,
        deactivatedAt: null,
      },
    };
  });
}
