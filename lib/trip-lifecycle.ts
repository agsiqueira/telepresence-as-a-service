import "server-only";

import { OfferStatus, Prisma, PrismaClient, Role, TripStatus } from "@prisma/client";
import { assignNextOperator, expireAndReassignOffers } from "./marketplace";

type Database = PrismaClient;
export type LifecycleFailure = { ok: false; status: 400 | 404 | 409; error: string };
export type LifecycleResult<T> = { ok: true; value: T } | LifecycleFailure;

const conflict = (error: string): LifecycleFailure => ({ ok: false, status: 409, error });
const isSerializationFailure = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

async function serializable<T>(db: Database, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isSerializationFailure(error) || attempt >= 2) throw error;
    }
  }
}

function ownsTrip(
  trip: { viewerId: string; operatorId: string | null },
  actorId: string,
  role: Role
) {
  void role; // Legacy caller perspective is retained while ownership is capability-based.
  return trip.viewerId === actorId || trip.operatorId === actorId;
}

export async function startTrip(
  db: Database,
  actorId: string,
  role: Role,
  tripId: string,
  now = new Date()
): Promise<LifecycleResult<Prisma.TripGetPayload<object>>> {
  try {
    return await serializable(db, async tx => {
      const trip = await tx.trip.findUnique({ where: { id: tripId }, include: { agreement: { select: { agreedEarliestStart: true } } } });
      if (!trip || !ownsTrip(trip, actorId, role)) return { ok: false, status: 404, error: "Not found" };
      if (trip.status === TripStatus.IN_PROGRESS) return { ok: true, value: trip };
      if (trip.status !== TripStatus.ACCEPTED) return conflict("Visit cannot be started");
      if (trip.agreement && trip.agreement.agreedEarliestStart > now) return conflict("Confirmed Journey has not reached its agreed start time");
      const changed = await tx.trip.updateMany({
        where: { id: tripId, status: TripStatus.ACCEPTED, operatorId: trip.operatorId },
        data: { status: TripStatus.IN_PROGRESS, startedAt: now },
      });
      if (changed.count !== 1) return conflict("Visit changed while starting");
      return { ok: true, value: await tx.trip.findUniqueOrThrow({ where: { id: tripId } }) };
    });
  } catch (error) {
    if (isSerializationFailure(error)) return conflict("Visit changed while starting");
    throw error;
  }
}

export async function cancelTrip(
  db: Database,
  actorId: string,
  role: Role,
  tripId: string,
  now = new Date()
): Promise<LifecycleResult<Prisma.TripGetPayload<object>>> {
  try {
    return await serializable(db, async tx => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip || !ownsTrip(trip, actorId, role)) return { ok: false, status: 404, error: "Not found" };
      if (trip.status === TripStatus.CANCELLED) return { ok: true, value: trip };
      const actsAsViewer = trip.viewerId === actorId;
      const actsAsOperator = trip.operatorId === actorId;
      const viewerAllowed = actsAsViewer && (
        trip.status === TripStatus.REQUESTED ||
        trip.status === TripStatus.OFFERED ||
        trip.status === TripStatus.ACCEPTED
      );
      const operatorAllowed = actsAsOperator && trip.status === TripStatus.ACCEPTED;
      if (!viewerAllowed && !operatorAllowed) return conflict("Visit cannot be cancelled");

      const changed = await tx.trip.updateMany({
        where: {
          id: tripId,
          status: trip.status,
          viewerId: trip.viewerId,
          operatorId: trip.operatorId,
          offeredOperatorId: trip.offeredOperatorId,
        },
        data: {
          status: TripStatus.CANCELLED,
          cancelledAt: now,
          cancelledBy: actsAsViewer ? Role.VIEWER : Role.OPERATOR,
          offeredOperatorId: null,
          offerExpiresAt: null,
        },
      });
      if (changed.count !== 1) return conflict("Visit changed while cancellation was processed");

      if (trip.status === TripStatus.OFFERED && trip.offeredOperatorId) {
        await tx.tripOffer.updateMany({
          where: { tripId, operatorId: trip.offeredOperatorId, status: OfferStatus.OFFERED },
          data: { status: OfferStatus.EXPIRED, respondedAt: now },
        });
        await tx.user.updateMany({
          where: { id: trip.offeredOperatorId, pendingOfferTripId: tripId },
          data: { pendingOfferTripId: null },
        });
      }
      if (trip.status === TripStatus.ACCEPTED && trip.operatorId) {
        await tx.user.updateMany({
          where: { id: trip.operatorId, activeTripId: tripId },
          data: { activeTripId: null },
        });
      }
      return { ok: true, value: await tx.trip.findUniqueOrThrow({ where: { id: tripId } }) };
    });
  } catch (error) {
    if (isSerializationFailure(error)) return conflict("Visit changed while cancellation was processed");
    throw error;
  }
}

export async function endTrip(
  db: Database,
  actorId: string,
  role: Role,
  tripId: string,
  now = new Date()
): Promise<LifecycleResult<Prisma.TripGetPayload<object>>> {
  try {
    return await serializable(db, async tx => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip || !ownsTrip(trip, actorId, role)) return { ok: false, status: 404, error: "Not found" };
      if (trip.status === TripStatus.ENDED || trip.status === TripStatus.FEEDBACK_COMPLETED) return { ok: true, value: trip };
      if (trip.status !== TripStatus.IN_PROGRESS) return conflict("Visit is not in progress");
      const changed = await tx.trip.updateMany({
        where: { id: tripId, status: TripStatus.IN_PROGRESS, operatorId: trip.operatorId },
        data: { status: TripStatus.ENDED, endedAt: now },
      });
      if (changed.count !== 1) return conflict("Visit changed while ending was processed");
      if (trip.operatorId) {
        await tx.user.updateMany({
          where: { id: trip.operatorId, activeTripId: tripId },
          data: { activeTripId: null },
        });
      }
      return { ok: true, value: await tx.trip.findUniqueOrThrow({ where: { id: tripId } }) };
    });
  } catch (error) {
    if (isSerializationFailure(error)) return conflict("Visit changed while ending was processed");
    throw error;
  }
}

export type FeedbackInput = {
  presence: number;
  mediaQuality: number;
  moodBefore?: number | null;
  moodAfter?: number | null;
};

export async function completeViewerFeedback(
  db: Database,
  viewerId: string,
  tripId: string,
  input: FeedbackInput | null,
  now = new Date()
) {
  try {
    return await serializable(db, async tx => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip || trip.viewerId !== viewerId) return { ok: false, status: 404, error: "Visit not found" } as const;
      if (trip.status === TripStatus.FEEDBACK_COMPLETED) {
        const feedback = await tx.feedback.findUnique({ where: { tripId } });
        return { ok: true, value: { trip, feedback, skipped: Boolean(trip.feedbackSkippedAt) } } as const;
      }
      if (trip.status !== TripStatus.ENDED) return conflict("Visit has not ended");
      let feedback = await tx.feedback.findUnique({ where: { tripId } });
      if (input && !feedback) {
        feedback = await tx.feedback.create({ data: { tripId, viewerId, ...input } });
      }
      const changed = await tx.trip.updateMany({
        where: { id: tripId, viewerId, status: TripStatus.ENDED },
        data: {
          status: TripStatus.FEEDBACK_COMPLETED,
          feedbackCompletedAt: now,
          feedbackSkippedAt: input ? null : now,
        },
      });
      if (changed.count !== 1) return conflict("Feedback completion changed concurrently");
      return {
        ok: true,
        value: {
          trip: await tx.trip.findUniqueOrThrow({ where: { id: tripId } }),
          feedback,
          skipped: !input,
        },
      } as const;
    });
  } catch (error) {
    if (isSerializationFailure(error)) return conflict("Feedback completion changed concurrently");
    throw error;
  }
}

export const RECOVERY_WINDOWS = {
  requestedMs: 2 * 60 * 1000,
  acceptedMs: 15 * 60 * 1000,
  inProgressGraceMs: 15 * 60 * 1000,
} as const;

export async function recoverStaleTrips(db: Database, now = new Date()) {
  return serializable(db, async tx => {
    await expireAndReassignOffers(tx, now);

    const offeredTrips = await tx.trip.findMany({
      where: { status: TripStatus.OFFERED, offeredOperatorId: { not: null } },
      select: { id: true, offeredOperatorId: true },
      take: 50,
    });
    for (const trip of offeredTrips) {
      const reservation = await tx.user.count({ where: { id: trip.offeredOperatorId!, pendingOfferTripId: trip.id } });
      if (reservation) continue;
      const repaired = await tx.user.updateMany({
        where: { id: trip.offeredOperatorId!, pendingOfferTripId: null, activeTripId: null },
        data: { pendingOfferTripId: trip.id },
      });
      if (repaired.count) continue;
      const cleared = await tx.trip.updateMany({
        where: { id: trip.id, status: TripStatus.OFFERED, offeredOperatorId: trip.offeredOperatorId },
        data: { status: TripStatus.REQUESTED, offeredOperatorId: null, offerExpiresAt: null },
      });
      if (!cleared.count) continue;
      await tx.tripOffer.updateMany({
        where: { tripId: trip.id, operatorId: trip.offeredOperatorId!, status: OfferStatus.OFFERED },
        data: { status: OfferStatus.EXPIRED, respondedAt: now },
      });
      await assignNextOperator(tx, trip.id, now);
    }

    const assignedTrips = await tx.trip.findMany({
      where: { status: { in: [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS] }, operatorId: { not: null } },
      select: { id: true, operatorId: true, status: true },
      take: 50,
    });
    for (const trip of assignedTrips) {
      const reservation = await tx.user.count({ where: { id: trip.operatorId!, activeTripId: trip.id } });
      if (reservation) continue;
      const repaired = await tx.user.updateMany({
        where: { id: trip.operatorId!, pendingOfferTripId: null, activeTripId: null },
        data: { activeTripId: trip.id },
      });
      if (repaired.count) continue;
      if (trip.status === TripStatus.ACCEPTED) {
        await tx.trip.updateMany({ where: { id: trip.id, status: TripStatus.ACCEPTED, operatorId: trip.operatorId }, data: { status: TripStatus.CANCELLED, cancelledAt: now } });
      } else {
        await tx.trip.updateMany({ where: { id: trip.id, status: TripStatus.IN_PROGRESS, operatorId: trip.operatorId }, data: { status: TripStatus.ENDED, endedAt: now } });
      }
    }

    const requestedCutoff = new Date(now.getTime() - RECOVERY_WINDOWS.requestedMs);
    await tx.trip.updateMany({
      where: { status: TripStatus.REQUESTED, requestedAt: { lte: requestedCutoff }, offeredOperatorId: null },
      data: { status: TripStatus.NO_OPERATOR_AVAILABLE, noOperatorAvailableAt: now },
    });

    const abandonedAccepted = await tx.trip.findMany({
      where: { status: TripStatus.ACCEPTED, acceptedAt: { lte: new Date(now.getTime() - RECOVERY_WINDOWS.acceptedMs) } },
      select: { id: true, operatorId: true, agreement: { select: { agreedEarliestStart: true, agreedLatestStart: true } } },
      take: 50,
    });
    for (const trip of abandonedAccepted) {
      const scheduledBoundary = trip.agreement?.agreedLatestStart ?? trip.agreement?.agreedEarliestStart;
      if (scheduledBoundary && scheduledBoundary.getTime() + RECOVERY_WINDOWS.acceptedMs > now.getTime()) continue;
      const changed = await tx.trip.updateMany({
        where: { id: trip.id, status: TripStatus.ACCEPTED },
        data: { status: TripStatus.CANCELLED, cancelledAt: now },
      });
      if (changed.count && trip.operatorId) await tx.user.updateMany({ where: { id: trip.operatorId, activeTripId: trip.id }, data: { activeTripId: null } });
    }

    const active = await tx.trip.findMany({
      where: { status: TripStatus.IN_PROGRESS, startedAt: { not: null } },
      select: { id: true, operatorId: true, startedAt: true, requestedDuration: true },
      take: 50,
    });
    for (const trip of active) {
      const maximum = ((trip.requestedDuration ?? 60) * 60 * 1000) + RECOVERY_WINDOWS.inProgressGraceMs;
      if (!trip.startedAt || trip.startedAt.getTime() + maximum > now.getTime()) continue;
      const changed = await tx.trip.updateMany({ where: { id: trip.id, status: TripStatus.IN_PROGRESS }, data: { status: TripStatus.ENDED, endedAt: now } });
      if (changed.count && trip.operatorId) await tx.user.updateMany({ where: { id: trip.operatorId, activeTripId: trip.id }, data: { activeTripId: null } });
    }

    const reserved = await tx.user.findMany({
      where: { OR: [{ pendingOfferTripId: { not: null } }, { activeTripId: { not: null } }] },
      select: { id: true, pendingOfferTripId: true, activeTripId: true },
      take: 100,
    });
    for (const user of reserved) {
      if (user.pendingOfferTripId) {
        const valid = await tx.trip.count({ where: { id: user.pendingOfferTripId, status: TripStatus.OFFERED, offeredOperatorId: user.id } });
        if (!valid) await tx.user.updateMany({ where: { id: user.id, pendingOfferTripId: user.pendingOfferTripId }, data: { pendingOfferTripId: null } });
      }
      if (user.activeTripId) {
        const valid = await tx.trip.count({ where: { id: user.activeTripId, status: { in: [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS] }, operatorId: user.id } });
        if (!valid) await tx.user.updateMany({ where: { id: user.id, activeTripId: user.activeTripId }, data: { activeTripId: null } });
      }
    }
    return { recovered: true };
  });
}

export const TRIP_HISTORY_SELECT = {
  id: true,
  destination: true,
  requestedDuration: true,
  status: true,
  requestedAt: true,
  offeredAt: true,
  acceptedAt: true,
  startedAt: true,
  endedAt: true,
  cancelledAt: true,
  noOperatorAvailableAt: true,
  feedbackCompletedAt: true,
  feedbackSkippedAt: true,
} satisfies Prisma.TripSelect;

export async function listViewerHistory(db: Database, viewerId: string, take = 25) {
  return db.trip.findMany({ where: { viewerId }, orderBy: [{ requestedAt: "desc" }, { id: "desc" }], take: Math.min(take, 50), select: TRIP_HISTORY_SELECT });
}

export async function listOperatorHistory(db: Database, operatorId: string, take = 25) {
  return db.tripOffer.findMany({
    where: { operatorId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(take, 50),
    select: {
      status: true,
      createdAt: true,
      respondedAt: true,
      trip: { select: TRIP_HISTORY_SELECT },
    },
  });
}

export async function retryUnavailableTrip(db: Database, viewerId: string, tripId: string) {
  const previous = await db.trip.findFirst({ where: { id: tripId, viewerId, status: TripStatus.NO_OPERATOR_AVAILABLE } });
  if (!previous || !previous.destinationId || !previous.requestedDuration) return { ok: false, status: 404, error: "Not found" } as const;
  const { createTripRequest } = await import("./phase3-services");
  return createTripRequest(db, viewerId, {
    destinationId: previous.destinationId,
    meetingArea: previous.meetingArea ?? undefined,
    requestedDuration: previous.requestedDuration,
    viewerNote: previous.viewerNote ?? undefined,
    preferredLanguage: previous.preferredLanguage ?? undefined,
    accessibilityNeeds: previous.accessibilityNeeds,
    customDestination: previous.customDestination ?? undefined,
    retryOfTripId: previous.id,
  });
}
