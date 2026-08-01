import "server-only";

import { randomUUID } from "crypto";
import { AccountStatus, AgreementStatus, JourneyRequestStatus, OperatorPilotStatus, Prisma, ProposalStatus, Role, TripStatus, type PrismaClient } from "@prisma/client";
import { profileIsComplete } from "@/lib/marketplace";
import { publicDisplayName } from "@/lib/profiles";

type Database = PrismaClient;
type Failure = { ok: false; status: 400 | 404 | 409; error: string };
const fail = (status: Failure["status"], error: string): Failure => ({ ok: false, status, error });
const retryable = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002");
const RESERVATION_EXCLUSION = "ScheduledJourneyReservation_no_confirmed_overlap";
const reservationConflict = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const details = error instanceof Prisma.PrismaClientKnownRequestError ? JSON.stringify(error.meta ?? {}) : "";
  return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" && details.includes("23P01")) ||
    ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2004") || error instanceof Prisma.PrismaClientUnknownRequestError) &&
      (details.includes(RESERVATION_EXCLUSION) || error.message.includes(RESERVATION_EXCLUSION));
};

const SNAPSHOT_SELECT = {
  id: true, journeyRequestId: true, proposalId: true, tripId: true,
  agreedStartAt: true,
  agreedEarliestStart: true, agreedLatestStart: true, agreedDurationMinutes: true,
  agreedPriceMinor: true, currency: true, destinationIdSnapshot: true,
  publicPlaceNameSnapshot: true, coarseLocationSnapshot: true,
  status: true, confirmedAt: true,
} satisfies Prisma.AgreementSelect;

const PRIVATE_SELECT = { ...SNAPSHOT_SELECT, privateMeetingSnapshot: true } satisfies Prisma.AgreementSelect;
const ADMIN_SELECT = { ...SNAPSHOT_SELECT, explorerId: true, teleporterId: true } satisfies Prisma.AgreementSelect;

async function serializable<T>(db: Database, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { if (!retryable(error) || attempt >= 2) throw error; }
  }
}

type AcceptanceInput = Record<string, unknown> & { scheduledStartAt?: unknown };
const explicitInstant = (value: unknown) => {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export async function acceptProposal(db: Database, explorerId: string, requestId: string, proposalId: string, input: AcceptanceInput = {}, now = new Date()) {
  try {
    return await serializable(db, async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "JourneyRequest" WHERE "id" = ${requestId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Proposal" WHERE "id" = ${proposalId} FOR UPDATE`);

      const existing = await tx.agreement.findUnique({ where: { journeyRequestId: requestId }, select: { ...PRIVATE_SELECT, explorerId: true, proposalId: true } });
      if (existing) {
        if (existing.explorerId === explorerId && existing.proposalId === proposalId) {
          const { explorerId: privateOwner, ...value } = existing; void privateOwner;
          return { ok: true as const, value, created: false };
        }
        return fail(409, "Journey Request already has a different confirmed Agreement");
      }
      if (Object.keys(input).some(key => key !== "scheduledStartAt")) return fail(400, "Unsupported acceptance field");

      await tx.journeyRequest.updateMany({ where: { id: requestId, status: JourneyRequestStatus.OPEN, expiresAt: { lte: now } }, data: { status: JourneyRequestStatus.EXPIRED, updatedAt: now } });
      await tx.proposal.updateMany({ where: { journeyRequestId: requestId, status: ProposalStatus.ACTIVE, validUntil: { lte: now } }, data: { status: ProposalStatus.EXPIRED, terminalAt: now } });

      const request = await tx.journeyRequest.findUnique({
        where: { id: requestId },
        select: { id: true, explorerId: true, destinationId: true, publicPlaceName: true, coarseLocation: true, privateMeetingDetails: true, expiresAt: true, status: true, tripId: true, explorer: { select: { role: true, accountStatus: true, preferredLanguage: true, accessibilityPreferences: true } }, destination: { select: { name: true, city: true, custom: true } } },
      });
      if (!request || request.explorerId !== explorerId) return fail(404, "Journey Request not found");
      if (request.explorer.role === Role.ADMIN || request.explorer.accountStatus !== AccountStatus.ACTIVE) return fail(404, "Journey Request not found");
      if (request.status !== JourneyRequestStatus.OPEN || request.expiresAt <= now || request.tripId) return fail(409, "Journey Request can no longer be confirmed");

      const proposal = await tx.proposal.findUnique({
        where: { id: proposalId },
        select: { id: true, journeyRequestId: true, teleporterId: true, earliestStart: true, latestStart: true, durationMinutes: true, proposedPriceMinor: true, currency: true, validUntil: true, status: true,
          teleporter: { select: { id: true, role: true, accountStatus: true, name: true, pendingOfferTripId: true, activeTripId: true, operatorProfile: true, destinationServices: { where: { destination: { active: true } }, select: { destinationId: true } }, tripsAsOperator: { where: { status: { in: [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS] } }, select: { id: true }, take: 1 } } } },
      });
      if (!proposal || proposal.journeyRequestId !== requestId) return fail(404, "Proposal not found");
      if (proposal.status !== ProposalStatus.ACTIVE || proposal.validUntil <= now) return fail(409, "Proposal can no longer be accepted");
      let agreedStartAt: Date;
      if (proposal.latestStart === null) {
        if (input.scheduledStartAt !== undefined) return fail(400, "A fixed Proposal start cannot be changed");
        agreedStartAt = proposal.earliestStart;
      } else {
        const selected = explicitInstant(input.scheduledStartAt);
        if (!selected) return fail(400, "Choose a scheduled start with an explicit UTC offset");
        if (selected < proposal.earliestStart || selected > proposal.latestStart) return fail(400, "Scheduled start must be within the Proposal window");
        agreedStartAt = selected;
      }
      if (!Number.isInteger(proposal.durationMinutes) || proposal.durationMinutes <= 0 || !Number.isFinite(agreedStartAt.getTime())) throw new Error("INVALID_RESERVATION_INTERVAL");
      const reservationEndAt = new Date(agreedStartAt.getTime() + proposal.durationMinutes * 60_000);
      if (!Number.isFinite(reservationEndAt.getTime()) || reservationEndAt <= agreedStartAt) throw new Error("INVALID_RESERVATION_INTERVAL");
      const teleporter = proposal.teleporter;
      const destinations = teleporter.destinationServices.map(value => value.destinationId);
      const supportsRequest = request.destinationId ? destinations.includes(request.destinationId) : Boolean(teleporter.operatorProfile?.supportsCustom);
      if (teleporter.role === Role.ADMIN || teleporter.accountStatus !== AccountStatus.ACTIVE || teleporter.operatorProfile?.pilotStatus !== OperatorPilotStatus.APPROVED || teleporter.pendingOfferTripId || teleporter.activeTripId || teleporter.tripsAsOperator.length || !supportsRequest || !profileIsComplete(teleporter.operatorProfile, destinations.length, teleporter.operatorProfile?.supportsCustom ?? false, publicDisplayName(teleporter.name))) return fail(409, "Teleporter is no longer eligible for a new confirmed Journey");
      if (teleporter.id === explorerId) return fail(409, "A Teleporter cannot fulfill their own Journey Request");

      const tripId = `trip-${randomUUID()}`;
      const reserved = await tx.user.updateMany({ where: { id: teleporter.id, accountStatus: AccountStatus.ACTIVE, activeTripId: null, pendingOfferTripId: null, operatorProfile: { is: { pilotStatus: OperatorPilotStatus.APPROVED } } }, data: { activeTripId: tripId } });
      if (reserved.count !== 1) return fail(409, "Teleporter changed availability during confirmation");
      const accepted = await tx.proposal.updateMany({ where: { id: proposal.id, journeyRequestId: requestId, status: ProposalStatus.ACTIVE, validUntil: { gt: now } }, data: { status: ProposalStatus.ACCEPTED, terminalAt: now } });
      if (accepted.count !== 1) return fail(409, "Proposal changed during confirmation");
      await tx.proposal.updateMany({ where: { journeyRequestId: requestId, id: { not: proposal.id }, status: ProposalStatus.ACTIVE, validUntil: { gt: now } }, data: { status: ProposalStatus.NOT_SELECTED, terminalAt: now } });

      const trip = await tx.trip.create({ data: {
        id: tripId, viewerId: explorerId, operatorId: teleporter.id, destinationId: request.destinationId,
        destination: request.destination?.custom ? request.publicPlaceName : (request.destination?.name ?? request.publicPlaceName),
        operatingArea: request.destination?.city ?? request.coarseLocation, meetingArea: request.coarseLocation,
        requestedDuration: proposal.durationMinutes, viewerNote: request.privateMeetingDetails,
        preferredLanguage: request.explorer.preferredLanguage, accessibilityNeeds: request.explorer.accessibilityPreferences,
        customDestination: request.destination?.custom ? request.publicPlaceName : null, immediate: false,
        livekitRoom: `trip-${randomUUID()}`, status: TripStatus.ACCEPTED, requestedAt: now, acceptedAt: now,
      }, select: { id: true } });

      const agreement = await tx.agreement.create({ data: {
        journeyRequestId: request.id, proposalId: proposal.id, explorerId, teleporterId: teleporter.id, tripId: trip.id,
        agreedStartAt,
        agreedEarliestStart: proposal.earliestStart, agreedLatestStart: proposal.latestStart,
        agreedDurationMinutes: proposal.durationMinutes, agreedPriceMinor: proposal.proposedPriceMinor,
        currency: proposal.currency.toUpperCase(), destinationIdSnapshot: request.destinationId,
        publicPlaceNameSnapshot: request.publicPlaceName, coarseLocationSnapshot: request.coarseLocation,
        privateMeetingSnapshot: request.privateMeetingDetails, status: AgreementStatus.CONFIRMED, confirmedAt: now,
      }, select: PRIVATE_SELECT });
      await tx.scheduledJourneyReservation.create({ data: {
        teleporterId: teleporter.id, agreementId: agreement.id, tripId: trip.id,
        startAt: agreedStartAt, endAt: reservationEndAt, status: "CONFIRMED",
      } });
      const converted = await tx.journeyRequest.updateMany({ where: { id: requestId, explorerId, status: JourneyRequestStatus.OPEN, expiresAt: { gt: now }, tripId: null }, data: { status: JourneyRequestStatus.CONVERTED, convertedAt: now, tripId: trip.id, updatedAt: now } });
      if (converted.count !== 1) throw new Error("REQUEST_CONVERSION_RACE");
      return { ok: true as const, value: agreement, created: true };
    });
  } catch (error) {
    if (reservationConflict(error)) return fail(409, "The Teleporter is no longer available for the selected Journey time.");
    if (retryable(error) || (error instanceof Error && error.message === "REQUEST_CONVERSION_RACE")) return fail(409, "Confirmation changed concurrently; refresh and try again");
    throw error;
  }
}

export async function getExplorerAgreement(db: Database, explorerId: string, requestId: string) {
  return db.agreement.findFirst({ where: { journeyRequestId: requestId, explorerId }, select: PRIVATE_SELECT });
}

export async function listTeleporterAgreements(db: Database, teleporterId: string) {
  return db.agreement.findMany({ where: { teleporterId }, orderBy: [{ confirmedAt: "desc" }, { id: "desc" }], take: 50, select: PRIVATE_SELECT });
}

export async function getTeleporterAgreement(db: Database, teleporterId: string, id: string) {
  return db.agreement.findFirst({ where: { id, teleporterId }, select: PRIVATE_SELECT });
}

export async function listAdminAgreements(db: Database) {
  return db.agreement.findMany({ orderBy: [{ confirmedAt: "desc" }, { id: "desc" }], take: 100, select: ADMIN_SELECT });
}
