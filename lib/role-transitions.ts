import "server-only";

import {
  AdminRoleChangeAction,
  OfferStatus,
  OperatorPilotStatus,
  Prisma,
  Role,
  TripStatus,
  type PrismaClient,
} from "@prisma/client";

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export type RoleTransitionFailureCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "ACTOR_NOT_FOUND"
  | "TARGET_NOT_FOUND"
  | "SELF_TRANSITION_FORBIDDEN"
  | "INVALID_CURRENT_ROLE"
  | "UNFINISHED_VIEWER_OBLIGATION"
  | "ACTIVE_OPERATOR_OBLIGATION"
  | "SERIALIZATION_RETRY_EXHAUSTED"
  | "INTERNAL_INVARIANT_FAILURE";

export type RoleTransitionFailure = {
  ok: false;
  code: RoleTransitionFailureCode;
  status: 401 | 403 | 404 | 409 | 500;
  error: string;
};

export type RoleTransitionSuccess = {
  ok: true;
  value: {
    targetId: string;
    previousRole: Role;
    newRole: Role;
    auditId: string;
  };
};

export type RoleTransitionResult = RoleTransitionSuccess | RoleTransitionFailure;

type Database = Pick<PrismaClient, "$transaction">;

class TransitionAbort extends Error {
  constructor(readonly failure: RoleTransitionFailure) {
    super(failure.code);
  }
}

const failure = (
  code: RoleTransitionFailureCode,
  status: RoleTransitionFailure["status"],
  error: string
): RoleTransitionFailure => ({ ok: false, code, status, error });

function abort(code: RoleTransitionFailureCode, status: RoleTransitionFailure["status"], error: string): never {
  throw new TransitionAbort(failure(code, status, error));
}

function isSerializableConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function runRoleTransition(
  db: Database,
  work: (tx: Prisma.TransactionClient) => Promise<RoleTransitionSuccess>
): Promise<RoleTransitionResult> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof TransitionAbort) return error.failure;
      if (isSerializableConflict(error)) {
        if (attempt < MAX_SERIALIZABLE_ATTEMPTS) continue;
        return failure(
          "SERIALIZATION_RETRY_EXHAUSTED",
          409,
          "Participant state changed concurrently; try again"
        );
      }
      return failure(
        "INTERNAL_INVARIANT_FAILURE",
        500,
        "Participant role could not be updated"
      );
    }
  }
  return failure("INTERNAL_INVARIANT_FAILURE", 500, "Participant role could not be updated");
}

async function authorizeActor(
  tx: Prisma.TransactionClient,
  actorId: string | null | undefined,
  targetId: string
) {
  if (!actorId) abort("UNAUTHORIZED", 401, "Authentication is required");
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
  if (!actor) abort("ACTOR_NOT_FOUND", 404, "Administrator not found");
  if (actor.role !== Role.ADMIN) abort("FORBIDDEN", 403, "Administrator authorization is required");
  if (actor.id === targetId) abort("SELF_TRANSITION_FORBIDDEN", 403, "Administrators cannot change their own participant role");
  return actor;
}

export async function assignViewerAsOperator(
  db: Database,
  actorId: string | null | undefined,
  targetId: string
): Promise<RoleTransitionResult> {
  return runRoleTransition(db, async tx => {
    const actor = await authorizeActor(tx, actorId, targetId);
    const target = await tx.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        role: true,
        pendingOfferTripId: true,
        activeTripId: true,
        operatorProfile: { select: { pilotStatus: true } },
      },
    });
    if (!target) abort("TARGET_NOT_FOUND", 404, "Participant not found");
    if (target.role !== Role.VIEWER) abort("INVALID_CURRENT_ROLE", 409, "Participant is not a Viewer");

    const unfinishedViewerTrips = await tx.trip.count({
      where: {
        viewerId: target.id,
        status: {
          in: [
            TripStatus.REQUESTED,
            TripStatus.OFFERED,
            TripStatus.ACCEPTED,
            TripStatus.IN_PROGRESS,
            TripStatus.ENDED,
          ],
        },
      },
    });
    if (unfinishedViewerTrips || target.pendingOfferTripId || target.activeTripId) {
      abort(
        "UNFINISHED_VIEWER_OBLIGATION",
        409,
        "Viewer has an unfinished visit obligation"
      );
    }

    const changed = await tx.user.updateMany({
      where: {
        id: target.id,
        role: Role.VIEWER,
        pendingOfferTripId: null,
        activeTripId: null,
      },
      data: { role: Role.OPERATOR, online: false },
    });
    if (changed.count !== 1) {
      abort("INTERNAL_INVARIANT_FAILURE", 409, "Participant state changed concurrently");
    }

    const pilotStatus =
      target.operatorProfile?.pilotStatus === OperatorPilotStatus.SUSPENDED
        ? OperatorPilotStatus.SUSPENDED
        : OperatorPilotStatus.PENDING;
    if (target.operatorProfile) {
      await tx.operatorProfile.update({
        where: { userId: target.id },
        data: { pilotStatus },
      });
    } else {
      await tx.operatorProfile.create({
        data: {
          userId: target.id,
          operatingArea: "",
          serviceRadiusKm: 0,
          supportsCustom: false,
          languages: [],
          accessibilityCapabilities: [],
          durationOptions: [],
          pilotStatus: OperatorPilotStatus.PENDING,
        },
      });
    }
    await tx.operatorDestination.deleteMany({ where: { operatorId: target.id } });
    const audit = await tx.adminRoleChangeAudit.create({
      data: {
        actorId: actor.id,
        targetId: target.id,
        action: AdminRoleChangeAction.ASSIGN_OPERATOR,
        previousRole: Role.VIEWER,
        newRole: Role.OPERATOR,
      },
      select: { id: true },
    });
    return {
      ok: true,
      value: {
        targetId: target.id,
        previousRole: Role.VIEWER,
        newRole: Role.OPERATOR,
        auditId: audit.id,
      },
    };
  });
}

export async function returnOperatorToViewer(
  db: Database,
  actorId: string | null | undefined,
  targetId: string
): Promise<RoleTransitionResult> {
  return runRoleTransition(db, async tx => {
    const actor = await authorizeActor(tx, actorId, targetId);
    const target = await tx.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        role: true,
        pendingOfferTripId: true,
        activeTripId: true,
        operatorProfile: { select: { pilotStatus: true } },
      },
    });
    if (!target) abort("TARGET_NOT_FOUND", 404, "Participant not found");
    if (target.role !== Role.OPERATOR) abort("INVALID_CURRENT_ROLE", 409, "Participant is not an Operator");

    const [activeTrips, pendingOffers] = await Promise.all([
      tx.trip.count({
        where: {
          OR: [
            { operatorId: target.id, status: { in: [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS] } },
            { offeredOperatorId: target.id, status: TripStatus.OFFERED },
          ],
        },
      }),
      tx.tripOffer.count({ where: { operatorId: target.id, status: OfferStatus.OFFERED } }),
    ]);
    if (target.pendingOfferTripId || target.activeTripId || activeTrips || pendingOffers) {
      abort("ACTIVE_OPERATOR_OBLIGATION", 409, "Operator has active marketplace work");
    }

    const changed = await tx.user.updateMany({
      where: {
        id: target.id,
        role: Role.OPERATOR,
        pendingOfferTripId: null,
        activeTripId: null,
      },
      data: { role: Role.VIEWER, online: false },
    });
    if (changed.count !== 1) {
      abort("INTERNAL_INVARIANT_FAILURE", 409, "Participant state changed concurrently");
    }

    if (target.operatorProfile) {
      await tx.operatorProfile.update({
        where: { userId: target.id },
        data: {
          pilotStatus:
            target.operatorProfile.pilotStatus === OperatorPilotStatus.SUSPENDED
              ? OperatorPilotStatus.SUSPENDED
              : OperatorPilotStatus.PENDING,
        },
      });
    }
    await tx.operatorDestination.deleteMany({ where: { operatorId: target.id } });
    const audit = await tx.adminRoleChangeAudit.create({
      data: {
        actorId: actor.id,
        targetId: target.id,
        action: AdminRoleChangeAction.RETURN_TO_VIEWER,
        previousRole: Role.OPERATOR,
        newRole: Role.VIEWER,
      },
      select: { id: true },
    });
    return {
      ok: true,
      value: {
        targetId: target.id,
        previousRole: Role.OPERATOR,
        newRole: Role.VIEWER,
        auditId: audit.id,
      },
    };
  });
}
