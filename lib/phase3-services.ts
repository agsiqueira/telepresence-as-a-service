import "server-only";

import { randomUUID } from "crypto";
import { OfferStatus, Prisma, PrismaClient, Role, TripStatus } from "@prisma/client";
import {
  ALLOWED_ACCESSIBILITY,
  ALLOWED_DURATIONS,
  ALLOWED_LANGUAGES,
  assignNextOperator,
  normalizedList,
} from "./marketplace";
import { cancelTrip, endTrip } from "./trip-lifecycle";
import { acquireSafetyRestrictionParticipantLocks, hasEffectiveSafetyRestrictionInTransaction } from "./safety-restriction-lock";

type Database = PrismaClient;
export type ServiceFailure = { ok: false; status: 400 | 403 | 404 | 409; error: string };
export type ServiceSuccess<T> = { ok: true; value: T };
export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

const conflict = (error: string): ServiceFailure => ({ ok: false, status: 409, error });
const serializableConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

async function runSerializable<T>(db: Database, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!serializableConflict(error) || attempt >= 1) throw error;
    }
  }
}
async function runSafetyLocked<T>(db: Database, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export const PUBLIC_DESTINATION_SELECT = {
  id: true,
  name: true,
  shortDescription: true,
  city: true,
  meetingArea: true,
  category: true,
  durationOptions: true,
  imageUrl: true,
  custom: true,
} satisfies Prisma.DestinationSelect;

export async function listActiveDestinations(db: Database | Prisma.TransactionClient) {
  return db.destination.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: PUBLIC_DESTINATION_SELECT,
  });
}

export type CreateTripInput = {
  destinationId: string;
  meetingArea?: string;
  requestedDuration: number;
  viewerNote?: string;
  preferredLanguage?: string;
  accessibilityNeeds: string[];
  customDestination?: string;
  retryOfTripId?: string;
};

export async function createTripRequest(
  db: Database,
  viewerId: string,
  input: CreateTripInput,
  roomId = () => `trip-${randomUUID()}`
): Promise<ServiceResult<{ trip: Prisma.TripGetPayload<object>; created: boolean }>> {
  try {
    return await runSafetyLocked(db, async tx => {
      await acquireSafetyRestrictionParticipantLocks(tx, [viewerId]);
      if (await hasEffectiveSafetyRestrictionInTransaction(tx, [viewerId])) return conflict("Account safety restriction prevents a new Journey");
      const participant = await tx.user.findUnique({
        where: { id: viewerId },
        select: { role: true, accountStatus: true },
      });
      if (!participant) return { ok: false, status: 404, error: "Viewer not found" } as const;
      if (participant.role === Role.ADMIN || participant.accountStatus !== "ACTIVE") {
        return conflict("Participant does not have Explorer capability");
      }

      const existing = await tx.trip.findFirst({
        where: {
          viewerId,
          status: {
            in: [
              TripStatus.REQUESTED,
              TripStatus.OFFERED,
              TripStatus.ACCEPTED,
              TripStatus.IN_PROGRESS,
            ],
          },
        },
      });
      if (existing) return conflict("An active visit request already exists");

      const destination = await tx.destination.findFirst({
        where: { id: input.destinationId, active: true },
      });
      if (!destination) return { ok: false, status: 400, error: "Destination is unavailable" };
      if (!destination.durationOptions.includes(input.requestedDuration)) {
        return { ok: false, status: 400, error: "Choose an available duration" };
      }
      if (destination.custom && (!input.customDestination || input.customDestination.length < 3 || input.customDestination.length > 120)) {
        return { ok: false, status: 400, error: "Describe the custom destination" };
      }
      if (!destination.custom && input.customDestination) {
        return { ok: false, status: 400, error: "Custom details are not valid for this destination" };
      }
      const created = await tx.trip.create({
        data: {
          viewerId,
          destinationId: destination.id,
          destination: destination.custom ? input.customDestination! : destination.name,
          operatingArea: destination.city,
          meetingArea: input.meetingArea || null,
          requestedDuration: input.requestedDuration,
          viewerNote: input.viewerNote || null,
          preferredLanguage: input.preferredLanguage || null,
          accessibilityNeeds: input.accessibilityNeeds,
          customDestination: destination.custom ? input.customDestination! : null,
          immediate: true,
          livekitRoom: roomId(),
          retryOfTripId: input.retryOfTripId,
        },
      });
      await assignNextOperator(tx, created.id);
      return { ok: true, value: { trip: await tx.trip.findUniqueOrThrow({ where: { id: created.id } }), created: true } };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && input.retryOfTripId) {
      const existing = await db.trip.findUnique({ where: { retryOfTripId: input.retryOfTripId } });
      if (existing) return { ok: true, value: { trip: existing, created: false } };
    }
    if (serializableConflict(error)) return conflict("A request is already being processed");
    throw error;
  }
}

export async function acceptTripOffer(db: Database, operatorId: string, tripId: string, now = new Date()) {
  try {
    return await runSafetyLocked(db, async tx => {
      const current = await tx.trip.findUnique({ where: { id: tripId } });
      if (!current) return conflict("Offer is no longer available");
      await acquireSafetyRestrictionParticipantLocks(tx, [current.viewerId, operatorId]);
      if (await hasEffectiveSafetyRestrictionInTransaction(tx, [current.viewerId, operatorId], now)) return conflict("Account safety restriction prevents accepting this Journey");
      if ((current?.status === TripStatus.ACCEPTED || current?.status === TripStatus.IN_PROGRESS) && current.operatorId === operatorId) {
        return { ok: true, value: current } as const;
      }
      const offer = await tx.tripOffer.findUnique({ where: { tripId_operatorId: { tripId, operatorId } } });
      if (!current || current.status !== TripStatus.OFFERED || current.offeredOperatorId !== operatorId ||
          !current.offerExpiresAt || current.offerExpiresAt <= now || offer?.status !== OfferStatus.OFFERED || offer.expiresAt <= now) {
        return conflict("Offer is no longer available");
      }
      const operator = await tx.user.updateMany({
        where: { id: operatorId, accountStatus: "ACTIVE", online: true, pendingOfferTripId: tripId, activeTripId: null, operatorProfile: { is: { pilotStatus: "APPROVED" } } },
        data: { pendingOfferTripId: null, activeTripId: tripId },
      });
      if (operator.count !== 1) return conflict("Offer is no longer available");
      const claimed = await tx.trip.updateMany({
        where: { id: tripId, status: TripStatus.OFFERED, offeredOperatorId: operatorId, offerExpiresAt: { gt: now } },
        data: { operatorId, offeredOperatorId: null, offerExpiresAt: null, status: TripStatus.ACCEPTED, acceptedAt: now },
      });
      if (claimed.count !== 1) throw new Error("ACCEPTANCE_RACE");
      const history = await tx.tripOffer.updateMany({
        where: { tripId, operatorId, status: OfferStatus.OFFERED, expiresAt: { gt: now } },
        data: { status: OfferStatus.ACCEPTED, respondedAt: now },
      });
      if (history.count !== 1) throw new Error("ACCEPTANCE_RACE");
      return { ok: true, value: await tx.trip.findUniqueOrThrow({ where: { id: tripId } }) } as const;
    });
  } catch (error) {
    if ((error instanceof Error && error.message === "ACCEPTANCE_RACE") || serializableConflict(error)) return conflict("Offer was accepted elsewhere");
    throw error;
  }
}

export async function declineTripOffer(db: Database, operatorId: string, tripId: string, now = new Date()) {
  try {
    return await runSerializable(db, async tx => {
      const claimed = await tx.trip.updateMany({
        where: { id: tripId, status: TripStatus.OFFERED, offeredOperatorId: operatorId, offerExpiresAt: { gt: now } },
        data: { status: TripStatus.REQUESTED, offeredOperatorId: null, offerExpiresAt: null },
      });
      if (claimed.count !== 1) return conflict("Offer is no longer available");
      const history = await tx.tripOffer.updateMany({
        where: { tripId, operatorId, status: OfferStatus.OFFERED, expiresAt: { gt: now } },
        data: { status: OfferStatus.DECLINED, respondedAt: now },
      });
      if (history.count !== 1) throw new Error("DECLINE_HISTORY_MISMATCH");
      await tx.user.updateMany({ where: { id: operatorId, pendingOfferTripId: tripId }, data: { pendingOfferTripId: null } });
      await assignNextOperator(tx, tripId, now);
      return { ok: true, value: { declined: true } } as const;
    });
  } catch (error) {
    if ((error instanceof Error && error.message === "DECLINE_HISTORY_MISMATCH") || serializableConflict(error)) return conflict("Offer is no longer available");
    throw error;
  }
}

export type OperatorSettingsInput = {
  operatingArea: string;
  serviceRadiusKm: number;
  supportsCustom: boolean;
  languages: string[];
  accessibilityCapabilities: string[];
  durationOptions: number[];
  destinationIds: string[];
};

export async function updateOperatorSettings(db: Database, operatorId: string, input: OperatorSettingsInput) {
  try {
    return await runSerializable(db, async tx => {
      const { destinationIds, ...profileData } = input;
      const validArea = await tx.destination.count({ where: { active: true, city: { equals: input.operatingArea, mode: "insensitive" } } });
      const currentInactive = await tx.operatorDestination.findMany({ where: { operatorId, destinationId: { in: destinationIds }, destination: { active: false } }, select: { destinationId: true } });
      const allowedInactiveIds = currentInactive.map(value => value.destinationId);
      const validDestinations = await tx.destination.count({ where: { id: { in: destinationIds.filter(id => !allowedInactiveIds.includes(id)) }, active: true, custom: false, city: { equals: input.operatingArea, mode: "insensitive" } } });
      if (!validArea || validDestinations + allowedInactiveIds.length !== destinationIds.length) return { ok: false, status: 400, error: "One or more destinations are unavailable" } as const;
      const available = await tx.user.updateMany({
        where: { id: operatorId, accountStatus: "ACTIVE", pendingOfferTripId: null, activeTripId: null, operatorProfile: { is: { pilotStatus: "APPROVED" } } },
        data: { online: false },
      });
      if (available.count !== 1) return conflict("Service settings cannot change during an offer or active visit");
      const profile = await tx.operatorProfile.upsert({
        where: { userId: operatorId }, update: profileData, create: { userId: operatorId, ...profileData },
      });
      await tx.operatorDestination.deleteMany({ where: { operatorId } });
      if (destinationIds.length) await tx.operatorDestination.createMany({ data: destinationIds.map(destinationId => ({ operatorId, destinationId })) });
      return { ok: true, value: { profile, destinationIds } } as const;
    });
  } catch (error) {
    if (serializableConflict(error)) return conflict("Service settings changed concurrently; try again");
    throw error;
  }
}

export async function cancelRequestedTrip(db: Database, viewerId: string, tripId: string, now = new Date()) {
  return cancelTrip(db, viewerId, Role.VIEWER, tripId, now);
}

export async function endAcceptedTrip(db: Database, actorId: string, actorRole: Role, tripId: string, now = new Date()) {
  return endTrip(db, actorId, actorRole, tripId, now);
}

export async function getCurrentOffer(db: Database | Prisma.TransactionClient, operatorId: string, now = new Date()) {
  return db.trip.findFirst({
    where: { status: TripStatus.OFFERED, offeredOperatorId: operatorId, offerExpiresAt: { gt: now }, offers: { some: { operatorId, status: OfferStatus.OFFERED } } },
    orderBy: { requestedAt: "asc" },
    select: { id: true, destination: true, meetingArea: true, requestedDuration: true, viewerNote: true, preferredLanguage: true, accessibilityNeeds: true, customDestination: true, immediate: true, offerExpiresAt: true },
  });
}

export function validateCreateTripInput(body: Record<string, unknown>): ServiceResult<CreateTripInput> {
  const destinationId = typeof body.destinationId === "string" ? body.destinationId : "";
  const meetingArea = typeof body.meetingArea === "string" ? body.meetingArea.trim() : "";
  const requestedDuration = Number(body.requestedDuration);
  const viewerNote = typeof body.viewerNote === "string" ? body.viewerNote.trim() : "";
  const preferredLanguage = typeof body.preferredLanguage === "string" ? body.preferredLanguage : "";
  const accessibilityNeeds = normalizedList(body.accessibilityNeeds, ALLOWED_ACCESSIBILITY);
  const customDestination = typeof body.customDestination === "string" ? body.customDestination.trim() : "";
  if (!destinationId || meetingArea.length > 120 || !Number.isInteger(requestedDuration) || viewerNote.length > 240 || !accessibilityNeeds) return { ok: false, status: 400, error: "Check the visit request" };
  if (preferredLanguage && !ALLOWED_LANGUAGES.includes(preferredLanguage as never)) return { ok: false, status: 400, error: "Choose an available language" };
  return { ok: true, value: { destinationId, meetingArea, requestedDuration, viewerNote, preferredLanguage, accessibilityNeeds, customDestination } };
}

export function validateSettingsInput(body: Record<string, unknown>): ServiceResult<OperatorSettingsInput> {
  const allowed = new Set(["operatingArea", "serviceRadiusKm", "supportsCustom", "languages", "accessibilityCapabilities", "durationOptions", "destinationIds"]);
  if (Object.keys(body).some(key => !allowed.has(key))) return { ok: false, status: 400, error: "Unsupported service setting" };
  const operatingArea = typeof body.operatingArea === "string" ? body.operatingArea.trim() : "";
  const serviceRadiusKm = Number(body.serviceRadiusKm);
  const languages = normalizedList(body.languages, ALLOWED_LANGUAGES);
  const accessibilityCapabilities = normalizedList(body.accessibilityCapabilities, ALLOWED_ACCESSIBILITY);
  const durationOptions = Array.isArray(body.durationOptions) ? [...new Set(body.durationOptions.map(Number))] : null;
  const destinationIds = Array.isArray(body.destinationIds) ? [...new Set(body.destinationIds.filter((id): id is string => typeof id === "string"))] : null;
  const supportsCustom = body.supportsCustom === true;
  if (operatingArea.length < 2 || operatingArea.length > 80 || !Number.isFinite(serviceRadiusKm) || serviceRadiusKm < 1 || serviceRadiusKm > 100 || !languages?.length || !accessibilityCapabilities || !durationOptions?.length || durationOptions.some(value => !ALLOWED_DURATIONS.includes(value as never)) || !destinationIds || destinationIds.length > 20 || (!destinationIds.length && !supportsCustom)) return { ok: false, status: 400, error: "Check the required service settings" };
  return { ok: true, value: { operatingArea, serviceRadiusKm, supportsCustom, languages, accessibilityCapabilities, durationOptions, destinationIds } };
}
