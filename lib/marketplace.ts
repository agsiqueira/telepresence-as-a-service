import "server-only";

import {
  OfferStatus,
  Prisma,
  Role,
  TripStatus,
  type Destination,
  type OperatorProfile,
  type User,
} from "@prisma/client";

export const OFFER_TIMEOUT_SECONDS = 30;
export const ALLOWED_DURATIONS = [15, 30, 45, 60] as const;
export const ALLOWED_LANGUAGES = ["English", "Spanish", "French", "Portuguese"] as const;
export const ALLOWED_ACCESSIBILITY = [
  "Wheelchair-accessible route support",
  "Low-noise environment preference",
  "Visual-description assistance",
  "Slower-paced visit",
  "Other",
] as const;

export function normalizedList(value: unknown, allowed: readonly string[], max = 8) {
  if (!Array.isArray(value)) return null;
  const items = [...new Set(value.filter((item): item is string => typeof item === "string"))];
  if (items.length > max || items.some((item) => !allowed.includes(item))) return null;
  return items;
}

export function profileIsComplete(
  profile: Pick<
    OperatorProfile,
    "operatingArea" | "serviceRadiusKm" | "languages" | "durationOptions"
  > | null,
  destinationCount: number,
  supportsCustom: boolean
) {
  return Boolean(
    profile?.operatingArea.trim() &&
      profile.serviceRadiusKm >= 1 &&
      profile.serviceRadiusKm <= 100 &&
      profile.languages.length > 0 &&
      profile.durationOptions.length > 0 &&
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
    role: Role.OPERATOR,
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
    const reserved = await tx.user.updateMany({
      where: {
        id: operator.id,
        online: true,
        pendingOfferTripId: null,
        activeTripId: null,
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
      data: { offeredOperatorId: operator.id, offerExpiresAt: expiresAt },
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
  return null;
}

export async function expireAndReassignOffers(
  tx: Prisma.TransactionClient,
  now = new Date()
) {
  const expired = await tx.trip.findMany({
    where: {
      status: TripStatus.REQUESTED,
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
        status: TripStatus.REQUESTED,
        offeredOperatorId: trip.offeredOperatorId,
        offerExpiresAt: { lte: now },
      },
      data: { offeredOperatorId: null, offerExpiresAt: null },
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
