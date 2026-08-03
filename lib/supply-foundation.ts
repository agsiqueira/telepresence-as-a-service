import "server-only";

import {
  AccountStatus,
  OperatorPilotStatus,
  Prisma,
  Role,
  SupplyCapacityClaimStatus,
  SupplyStatus,
  SupplyType,
  type PrismaClient,
} from "@prisma/client";
import { profileIsComplete } from "@/lib/marketplace";
import { publicDisplayName } from "@/lib/profiles";
import { acquireSafetyRestrictionParticipantLocks, finalizeExpiredRestrictionsInTransaction, hasEffectiveSafetyRestrictionInTransaction } from "@/lib/safety-restriction-lock";

type Db = PrismaClient | Prisma.TransactionClient;
type SupplyTarget = { liveMomentId: string; occurrenceId?: never } | { occurrenceId: string; liveMomentId?: never };

export class SupplyFoundationError extends Error {
  constructor(readonly code: "INVALID" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE", readonly status: 400 | 403 | 404 | 409) {
    super(code);
  }
}

const exact = <T extends readonly string[]>(input: unknown, keys: T): Record<T[number], unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new SupplyFoundationError("INVALID", 400);
  const actual = Object.keys(input);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) throw new SupplyFoundationError("INVALID", 400);
  return input as Record<T[number], unknown>;
};
const bounded = (value: unknown, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new SupplyFoundationError("INVALID", 400);
  return value.trim();
};
const integer = (value: unknown, min: number, max: number) => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new SupplyFoundationError("INVALID", 400);
  return value as number;
};
const instant = (value: unknown) => {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new SupplyFoundationError("INVALID", 400);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new SupplyFoundationError("INVALID", 400);
  return parsed;
};
const currencies = new Set(["AUD", "BRL", "CAD", "CHF", "EUR", "GBP", "JPY", "MXN", "NZD", "USD"]);
const currency = (value: unknown) => {
  const normalized = bounded(value, 3).toUpperCase();
  if (!currencies.has(normalized)) throw new SupplyFoundationError("INVALID", 400);
  return normalized;
};

async function requireMutationActor(db: Db, actorId: string, teleporter: boolean) {
  await acquireSafetyRestrictionParticipantLocks(db as Prisma.TransactionClient, [actorId]);
  await finalizeExpiredRestrictionsInTransaction(db as Prisma.TransactionClient, [actorId], new Date());
  const actor = await db.user.findUnique({
    where: { id: actorId },
    select: { id: true, name: true, role: true, accountStatus: true, operatorProfile: true, destinationServices: { select: { destinationId: true } } },
  });
  if (!actor || actor.accountStatus !== AccountStatus.ACTIVE || actor.role === Role.ADMIN || await hasEffectiveSafetyRestrictionInTransaction(db as Prisma.TransactionClient, [actorId], new Date())) throw new SupplyFoundationError("FORBIDDEN", 403);
  if (teleporter && (actor.operatorProfile?.pilotStatus !== OperatorPilotStatus.APPROVED || !profileIsComplete(actor.operatorProfile, actor.destinationServices.length, actor.operatorProfile.supportsCustom, publicDisplayName(actor.name)))) throw new SupplyFoundationError("FORBIDDEN", 403);
  return actor;
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof SupplyFoundationError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2004"].includes(error.code)) throw new SupplyFoundationError("CONFLICT", 409);
  throw new SupplyFoundationError("UNAVAILABLE", 409);
}

export async function createLiveMomentFoundation(db: PrismaClient, teleporterId: string, input: unknown) {
  const body = exact(input, ["publicPlaceName", "coarseLocation", "durationMinutes", "priceMinor", "currency", "capacity", "availabilityStart", "availabilityEnd", "expiresAt"] as const);
  const availabilityStart = instant(body.availabilityStart), availabilityEnd = instant(body.availabilityEnd), expiresAt = instant(body.expiresAt);
  if (availabilityStart >= availabilityEnd || expiresAt > availabilityEnd) throw new SupplyFoundationError("INVALID", 400);
  try {
    return await db.$transaction(async tx => {
      await requireMutationActor(tx, teleporterId, true);
      const listing = await tx.supplyListing.create({
        data: {
          teleporterId, type: SupplyType.LIVE_MOMENT, publicPlaceName: bounded(body.publicPlaceName, 120), coarseLocation: bounded(body.coarseLocation, 120),
          durationMinutes: integer(body.durationMinutes, 1, 1440), priceMinor: integer(body.priceMinor, 1, 100_000_000), currency: currency(body.currency), capacity: integer(body.capacity, 1, 1000),
        },
        select: { id: true },
      });
      await tx.liveMoment.create({ data: { listingId: listing.id, availabilityStart, availabilityEnd, expiresAt } });
      return tx.supplyListing.findUniqueOrThrow({ where: { id: listing.id }, select: { id: true, type: true, status: true, version: true, liveMoment: { select: { id: true, availabilityStart: true, availabilityEnd: true, expiresAt: true } } } });
    });
  } catch (error) { mapDatabaseError(error); }
}

export async function createGuidedExperienceFoundation(db: PrismaClient, teleporterId: string, input: unknown) {
  const body = exact(input, ["title", "description", "publicPlaceName", "coarseLocation", "durationMinutes", "priceMinor", "currency"] as const);
  const title=bounded(body.title,120),description=bounded(body.description,2000);if(title.length<3||description.length<20)throw new SupplyFoundationError("INVALID",400);
  try {
    return await db.$transaction(async tx => {
      await requireMutationActor(tx, teleporterId, true);
      return tx.supplyListing.create({ data: { teleporterId, type: SupplyType.GUIDED_EXPERIENCE, publicPlaceName: bounded(body.publicPlaceName, 120), coarseLocation: bounded(body.coarseLocation, 120), durationMinutes: integer(body.durationMinutes, 1, 1440), priceMinor: integer(body.priceMinor, 1, 100_000_000), currency: currency(body.currency), capacity: 1, guidedExperience: { create: { title, description } } }, select: { id: true, type: true, status: true, version: true, guidedExperience: { select: { id: true, title: true, description: true } } } });
    });
  } catch (error) { mapDatabaseError(error); }
}

export async function createGuidedOccurrenceFoundation(db: PrismaClient, teleporterId: string, listingId: string, input: unknown) {
  const body = exact(input, ["startAt"] as const), availabilityStart = instant(body.startAt);
  try {
    return await db.$transaction(async tx => {
      await requireMutationActor(tx, teleporterId, true);
      const listing = await tx.supplyListing.findFirst({ where: { id: listingId, teleporterId, type: SupplyType.GUIDED_EXPERIENCE }, select: { durationMinutes: true, guidedExperience: { select: { id: true } } } });
      if (!listing?.guidedExperience) throw new SupplyFoundationError("NOT_FOUND", 404);
      return tx.guidedExperienceOccurrence.create({ data: { guidedExperienceId: listing.guidedExperience.id, availabilityStart, availabilityEnd: new Date(availabilityStart.getTime()+listing.durationMinutes*60_000), capacity: 1 }, select: { id: true, status: true, availabilityStart: true, availabilityEnd: true, capacity: true } });
    });
  } catch (error) { mapDatabaseError(error); }
}

export async function transitionSupplyFoundation(db: PrismaClient, teleporterId: string, listingId: string, input: unknown) {
  const body = exact(input, ["expectedVersion", "status"] as const), expectedVersion = integer(body.expectedVersion, 1, 2_147_483_647);
  const transitions: SupplyStatus[] = [SupplyStatus.PUBLISHED, SupplyStatus.PAUSED, SupplyStatus.ARCHIVED];
  if (typeof body.status !== "string" || !transitions.includes(body.status as SupplyStatus)) throw new SupplyFoundationError("INVALID", 400);
  const status = body.status as SupplyStatus, now = new Date();
  try {
    return await db.$transaction(async tx => {
      await requireMutationActor(tx, teleporterId, true);
      const changed = await tx.supplyListing.updateMany({ where: { id: listingId, teleporterId, version: expectedVersion }, data: { status, version: { increment: 1 }, ...(status === SupplyStatus.PUBLISHED ? { publishedAt: now } : status === SupplyStatus.PAUSED ? { pausedAt: now } : { archivedAt: now }) } });
      if (changed.count !== 1) {
        if (!await tx.supplyListing.findFirst({ where: { id: listingId, teleporterId }, select: { id: true } })) throw new SupplyFoundationError("NOT_FOUND", 404);
        throw new SupplyFoundationError("CONFLICT", 409);
      }
      return tx.supplyListing.findUniqueOrThrow({ where: { id: listingId }, select: { id: true, type: true, status: true, version: true } });
    });
  } catch (error) { mapDatabaseError(error); }
}

export async function createSupplyCapacityClaim(db: PrismaClient, explorerId: string, listingId: string, target: SupplyTarget, input: unknown) {
  const startAt = instant(exact(input, ["startAt"] as const).startAt);
  try {
    return await db.$transaction(async tx => {
      await requireMutationActor(tx, explorerId, false);
      const listing = await tx.supplyListing.findFirst({ where: { id: listingId, status: SupplyStatus.PUBLISHED }, select: { id: true, teleporterId: true, durationMinutes: true } });
      if (!listing || listing.teleporterId === explorerId) throw new SupplyFoundationError("NOT_FOUND", 404);
      const existing = await tx.supplyCapacityClaim.findFirst({ where: { explorerId, status: SupplyCapacityClaimStatus.HELD, expiresAt: { gt: new Date() }, ...(target.liveMomentId ? { liveMomentId: target.liveMomentId } : { occurrenceId: target.occurrenceId }) }, select: { id: true, startAt: true, endAt: true, expiresAt: true, status: true } });
      const endAt = new Date(startAt.getTime() + listing.durationMinutes * 60_000);
      if (existing) {
        if (existing.startAt.getTime() === startAt.getTime()) return existing;
        throw new SupplyFoundationError("CONFLICT", 409);
      }
      return tx.supplyCapacityClaim.create({ data: { listingId, explorerId, teleporterId: listing.teleporterId, startAt, endAt, expiresAt: new Date(0), ...(target.liveMomentId ? { liveMomentId: target.liveMomentId } : { occurrenceId: target.occurrenceId }) }, select: { id: true, startAt: true, endAt: true, expiresAt: true, status: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) { mapDatabaseError(error); }
}

export async function releaseSupplyCapacityClaim(db: PrismaClient, explorerId: string, claimId: string) {
  try {
    return await db.$transaction(async tx => {
      await requireMutationActor(tx, explorerId, false);
      const changed = await tx.supplyCapacityClaim.updateMany({ where: { id: claimId, explorerId, status: SupplyCapacityClaimStatus.HELD }, data: { status: SupplyCapacityClaimStatus.RELEASED, releasedAt: new Date() } });
      if (changed.count !== 1) {
        if (!await tx.supplyCapacityClaim.findFirst({ where: { id: claimId, explorerId }, select: { id: true } })) throw new SupplyFoundationError("NOT_FOUND", 404);
        throw new SupplyFoundationError("CONFLICT", 409);
      }
      return { id: claimId, status: SupplyCapacityClaimStatus.RELEASED };
    });
  } catch (error) { mapDatabaseError(error); }
}

export async function expireSupplyCapacityClaims(db: PrismaClient) {
  const changed = await db.$executeRaw`UPDATE "SupplyCapacityClaim" SET "status"='EXPIRED', "releasedAt"=CURRENT_TIMESTAMP WHERE "status"='HELD' AND "expiresAt"<=CURRENT_TIMESTAMP`;
  return { expiredCount: changed };
}

export async function commitSupplyCapacityClaimInTransaction(
  tx: Prisma.TransactionClient,
  claimId: string,
  authority: { journeyRequestId: string; proposalId: string; agreementId: string; tripId: string },
) {
  const claim = await tx.supplyCapacityClaim.findFirst({
    where: { id: claimId, status: SupplyCapacityClaimStatus.HELD, expiresAt: { gt: new Date() } },
    select: { listingId: true, occurrenceId: true, explorerId: true, teleporterId: true },
  });
  if (!claim) throw new SupplyFoundationError("CONFLICT", 409);
  const linked = await tx.agreement.findFirst({
    where: {
      id: authority.agreementId, journeyRequestId: authority.journeyRequestId, proposalId: authority.proposalId, tripId: authority.tripId,
      explorerId: claim.explorerId, teleporterId: claim.teleporterId,
      journeyRequest: { supplyListingId: claim.listingId, supplyOccurrenceId: claim.occurrenceId },
      proposal: { supplyListingId: claim.listingId, supplyOccurrenceId: claim.occurrenceId },
    },
    select: { id: true },
  });
  if (!linked) throw new SupplyFoundationError("CONFLICT", 409);
  const changed = await tx.supplyCapacityClaim.updateMany({ where: { id: claimId, status: SupplyCapacityClaimStatus.HELD, expiresAt: { gt: new Date() } }, data: { status: SupplyCapacityClaimStatus.COMMITTED, committedAt: new Date(), ...authority } });
  if (changed.count !== 1) throw new SupplyFoundationError("CONFLICT", 409);
  return { id: claimId, status: SupplyCapacityClaimStatus.COMMITTED };
}

export async function isSupplyIntervalRestorable(db: PrismaClient, listingId: string, startAt: Date, endAt: Date) {
  const now = new Date();
  const listing = await db.supplyListing.findFirst({
    where: { id: listingId, status: SupplyStatus.PUBLISHED },
    select: { durationMinutes: true, liveMoment: { select: { availabilityStart: true, availabilityEnd: true, expiresAt: true } }, guidedExperience: { select: { occurrences: { where: { status: SupplyStatus.PUBLISHED, availabilityStart: { lte: startAt }, availabilityEnd: { gte: endAt } }, select: { id: true }, take: 1 } } } },
  });
  if (!listing || endAt.getTime() - startAt.getTime() !== listing.durationMinutes * 60_000) return false;
  if (listing.liveMoment) return listing.liveMoment.expiresAt > now && listing.liveMoment.availabilityStart <= startAt && listing.liveMoment.availabilityEnd >= endAt;
  return Boolean(listing.guidedExperience?.occurrences.length);
}

export async function getOwnedSupplyFoundation(db: PrismaClient, teleporterId: string, listingId: string) {
  const listing = await db.supplyListing.findFirst({ where: { id: listingId, teleporterId }, select: { id: true, type: true, status: true, publicPlaceName: true, coarseLocation: true, durationMinutes: true, priceMinor: true, currency: true, capacity: true, version: true, createdAt: true, liveMoment: { select: { id: true, availabilityStart: true, availabilityEnd: true, expiresAt: true } }, guidedExperience: { select: { id: true, occurrences: { select: { id: true, status: true, availabilityStart: true, availabilityEnd: true, capacity: true } } } } } });
  if (!listing) throw new SupplyFoundationError("NOT_FOUND", 404);
  return listing;
}
