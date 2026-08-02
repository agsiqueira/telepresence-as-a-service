import "server-only";

import {
  OfferStatus,
  OperatorPilotStatus,
  Prisma,
  TripStatus,
  type Destination,
  type OperatorProfile,
  type User,
} from "@prisma/client";
export { ALLOWED_ACCESSIBILITY, ALLOWED_DURATIONS, ALLOWED_LANGUAGES } from "./marketplace-vocabulary";
import { acquireSafetyRestrictionParticipantLocks, hasEffectiveSafetyRestrictionInTransaction } from "./safety-restriction-lock";
import { ALLOWED_ACCESSIBILITY, ALLOWED_DURATIONS, ALLOWED_LANGUAGES } from "./marketplace-vocabulary";

export const OFFER_TIMEOUT_SECONDS = 30;

export function normalizedList(value: unknown, allowed: readonly string[], max = 8) {
  if (!Array.isArray(value)) return null;
  const items = [...new Set(value.filter((item): item is string => typeof item === "string"))];
  if (items.length > max || items.some((item) => !allowed.includes(item))) return null;
  return items;
}

export function profileIsComplete(
  profile: Pick<
    OperatorProfile,
    "operatingArea" | "serviceRadiusKm" | "languages" | "accessibilityCapabilities" | "durationOptions"
  > | null,
  destinationCount: number,
  supportsCustom: boolean,
  displayName: string | null = null
) {
  if (!profile) return false;
  return Boolean(
    displayName?.trim() &&
      !/\S+@\S+\.\S+/.test(displayName) &&
      displayName.trim().length <= 80 &&
      profile.operatingArea.trim().length >= 2 &&
      profile.operatingArea.trim().length <= 80 &&
      Number.isFinite(profile.serviceRadiusKm) &&
      profile.serviceRadiusKm >= 1 &&
      profile.serviceRadiusKm <= 100 &&
      profile.languages.length > 0 &&
      profile.languages.length <= 8 &&
      profile.languages.every(value => ALLOWED_LANGUAGES.includes(value as never)) &&
      profile.accessibilityCapabilities.length <= 8 &&
      profile.accessibilityCapabilities.every(value => ALLOWED_ACCESSIBILITY.includes(value as never)) &&
      profile.durationOptions.length > 0 &&
      profile.durationOptions.every(value => ALLOWED_DURATIONS.includes(value as never)) &&
      (destinationCount > 0 || supportsCustom)
  );
}

type TripForMatching = {
  id: string;
  operatingArea: string | null;
  destinationId: string | null;
  requestedDuration: number | null;
  preferredLanguage: string | null;
  accessibilityNeeds: string[];
  customDestination: string | null;
  destinationRef: Destination | null;
};

function eligibleOperatorWhere(trip: TripForMatching): Prisma.UserWhereInput {
  const custom = Boolean(trip.customDestination || trip.destinationRef?.custom);
  return {
    accountStatus: "ACTIVE",
    name: { not: null },
    online: true,
    operatorProfile: {
      is: {
        operatingArea: {
          // Pilot compatibility is a normalized operating-area match. Radius is stored
          // for future coordinate-backed matching and is not presented as distance today.
          equals: trip.operatingArea ?? "",
          mode: "insensitive",
        },
        serviceRadiusKm: { gte: 1 },
        pilotStatus: OperatorPilotStatus.APPROVED,
        durationOptions: trip.requestedDuration
          ? { has: trip.requestedDuration }
          : undefined,
        languages: trip.preferredLanguage
          ? { has: trip.preferredLanguage }
          : undefined,
        accessibilityCapabilities:
          trip.accessibilityNeeds.length > 0
            ? { hasEvery: trip.accessibilityNeeds }
            : undefined,
        supportsCustom: custom ? true : undefined,
      },
    },
    destinationServices:
      !custom && trip.destinationId
        ? { some: { destinationId: trip.destinationId } }
        : undefined,
    pendingOfferTripId: null,
    activeTripId: null,
    offers: { none: { tripId: trip.id } },
  };
}

export async function assignNextOperator(
  tx: Prisma.TransactionClient,
  tripId: string,
  now = new Date()
) {
  const trip = await tx.trip.findUnique({
    where: { id: tripId },
    include: { destinationRef: true },
  });
  if (!trip || trip.status !== TripStatus.REQUESTED || trip.offeredOperatorId) return null;

  const operators = await tx.user.findMany({
    where: eligibleOperatorWhere(trip),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
    take: 20,
  });
  for (const operator of operators) {
    await acquireSafetyRestrictionParticipantLocks(tx, [trip.viewerId, operator.id]);
    if (await hasEffectiveSafetyRestrictionInTransaction(tx, [trip.viewerId, operator.id], now)) continue;
    const reserved = await tx.user.updateMany({
      where: {
        id: operator.id,
        online: true,
        pendingOfferTripId: null,
        activeTripId: null,
        accountStatus: "ACTIVE",
        operatorProfile: { is: { pilotStatus: OperatorPilotStatus.APPROVED } },
      },
      data: { pendingOfferTripId: trip.id },
    });
    if (reserved.count !== 1) continue;

    const expiresAt = new Date(now.getTime() + OFFER_TIMEOUT_SECONDS * 1000);
    const claimed = await tx.trip.updateMany({
      where: {
        id: trip.id,
        status: TripStatus.REQUESTED,
        offeredOperatorId: null,
      },
      data: {
        offeredOperatorId: operator.id,
        offerExpiresAt: expiresAt,
        offeredAt: now,
        status: TripStatus.OFFERED,
      },
    });
    if (claimed.count !== 1) {
      await tx.user.updateMany({
        where: { id: operator.id, pendingOfferTripId: trip.id },
        data: { pendingOfferTripId: null },
      });
      return null;
    }

    // History is written only after both the operator row and trip row are won,
    // and all three writes commit or roll back together in the caller transaction.
    await tx.tripOffer.create({
      data: { tripId: trip.id, operatorId: operator.id, expiresAt },
    });
    return operator.id;
  }

  await tx.trip.updateMany({
    where: { id: trip.id, status: TripStatus.REQUESTED, offeredOperatorId: null },
    data: {
      status: TripStatus.NO_OPERATOR_AVAILABLE,
      noOperatorAvailableAt: now,
    },
  });
  return null;
}

export async function expireAndReassignOffers(
  tx: Prisma.TransactionClient,
  now = new Date()
) {
  const expired = await tx.trip.findMany({
    where: {
      status: TripStatus.OFFERED,
      offeredOperatorId: { not: null },
      offerExpiresAt: { lte: now },
    },
    select: { id: true, offeredOperatorId: true },
    take: 20,
  });

  for (const trip of expired) {
    const cleared = await tx.trip.updateMany({
      where: {
        id: trip.id,
        status: TripStatus.OFFERED,
        offeredOperatorId: trip.offeredOperatorId,
        offerExpiresAt: { lte: now },
      },
      data: {
        status: TripStatus.REQUESTED,
        offeredOperatorId: null,
        offerExpiresAt: null,
      },
    });
    if (cleared.count !== 1) continue;
    const history = await tx.tripOffer.updateMany({
      where: {
        tripId: trip.id,
        operatorId: trip.offeredOperatorId!,
        status: OfferStatus.OFFERED,
        expiresAt: { lte: now },
      },
      data: { status: OfferStatus.EXPIRED, respondedAt: now },
    });
    if (history.count !== 1) throw new Error("OFFER_HISTORY_MISMATCH");
    await tx.user.updateMany({
      where: {
        id: trip.offeredOperatorId!,
        pendingOfferTripId: trip.id,
      },
      data: { pendingOfferTripId: null },
    });
    await assignNextOperator(tx, trip.id, now);
  }
}

export async function assignWaitingTrips(
  tx: Prisma.TransactionClient,
  now = new Date()
) {
  const waiting = await tx.trip.findMany({
    where: {
      status: TripStatus.REQUESTED,
      offeredOperatorId: null,
    },
    orderBy: { requestedAt: "asc" },
    select: { id: true },
    take: 20,
  });
  for (const trip of waiting) await assignNextOperator(tx, trip.id, now);
}

export type OperatorWithProfile = User & { operatorProfile: OperatorProfile | null };
