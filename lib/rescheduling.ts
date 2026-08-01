import "server-only";

import { Prisma, PrismaClient, ScheduledJourneyRescheduleStatus, TripStatus } from "@prisma/client";

type Database = PrismaClient;
type Failure = { ok: false; status: 400 | 404 | 409; error: string };
const fail = (status: Failure["status"], error: string): Failure => ({ ok: false, status, error });
const retryable = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const pendingProposalConflict = (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const details = JSON.stringify(error.meta ?? {});
  return details.includes("ScheduledJourneyRescheduleProposal_one_pending_trip") || details.includes("tripId");
};
const schedulingConflict = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const details = error instanceof Prisma.PrismaClientKnownRequestError ? JSON.stringify(error.meta ?? {}) : "";
  return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" && details.includes("23P01")) ||
    ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2004") || error instanceof Prisma.PrismaClientUnknownRequestError) &&
      (details.includes("ScheduledJourneyReservation_no_confirmed_overlap") || error.message.includes("ScheduledJourneyReservation_no_confirmed_overlap"));
};
async function serializable<T>(db: Database, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { if (!retryable(error) || attempt >= 2) throw error; }
  }
}
const parseInstant = (value: unknown) => {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const party = (trip: { viewerId: string; operatorId: string | null }, actorId: string) => trip.viewerId === actorId ? "EXPLORER" : trip.operatorId === actorId ? "TELEPORTER" : null;
const safe = <T extends { proposerId: string }>(value: T, trip: { viewerId: string }, actorId: string) => {
  const proposal = value as T & { id: string; proposedStartAt: Date; proposedEndAt: Date; status: ScheduledJourneyRescheduleStatus; createdAt: Date; resolvedAt: Date | null };
  const proposerParty = proposal.proposerId === trip.viewerId ? "EXPLORER" : "TELEPORTER";
  return { id: proposal.id, proposedStartAt: proposal.proposedStartAt, proposedEndAt: proposal.proposedEndAt, status: proposal.status, createdAt: proposal.createdAt, resolvedAt: proposal.resolvedAt, proposerParty, canAccept: proposal.proposerId !== actorId, canDecline: proposal.proposerId !== actorId, canWithdraw: proposal.proposerId === actorId };
};

export async function createRescheduleProposal(db: Database, actorId: string, tripId: string, input: { proposedStartAt?: unknown; proposedEndAt?: unknown }, now = new Date()) {
  const startAt = parseInstant(input.proposedStartAt), endAt = parseInstant(input.proposedEndAt);
  if (!startAt || !endAt || endAt <= startAt) return fail(400, "Choose a valid replacement interval with explicit UTC offsets");
  if (startAt <= now) return fail(400, "The proposed Journey time must be in the future");
  try {
    return await serializable(db, async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Trip" WHERE "id" = ${tripId} FOR UPDATE`);
      const trip = await tx.trip.findUnique({ where: { id: tripId }, include: { agreement: true, scheduledReservations: { where: { status: "CONFIRMED" }, take: 2 } } });
      if (!trip || !party(trip, actorId)) return fail(404, "Journey not found");
      if (trip.status !== TripStatus.ACCEPTED || !trip.agreement || trip.immediate || trip.scheduledReservations.length !== 1) return fail(409, "Journey cannot be rescheduled");
      const current = trip.scheduledReservations[0];
      if (current.startAt.getTime() === startAt.getTime() && current.endAt.getTime() === endAt.getTime()) return fail(400, "Choose a different Journey time");
      const pending = await tx.scheduledJourneyRescheduleProposal.findFirst({ where: { tripId, status: ScheduledJourneyRescheduleStatus.PENDING } });
      if (pending) {
        if (pending.proposerId === actorId && pending.proposedStartAt.getTime() === startAt.getTime() && pending.proposedEndAt.getTime() === endAt.getTime()) return { ok: true as const, value: safe(pending, trip, actorId), created: false };
        return fail(409, "A reschedule proposal is already pending");
      }
      const created = await tx.scheduledJourneyRescheduleProposal.create({ data: { agreementId: trip.agreement.id, tripId, proposerId: actorId, fromReservationId: current.id, proposedStartAt: startAt, proposedEndAt: endAt } });
      return { ok: true as const, value: safe(created, trip, actorId), created: true };
    });
  } catch (error) {
    if (pendingProposalConflict(error)) return fail(409, "A reschedule proposal is already pending");
    if (retryable(error)) return fail(409, "Reschedule changed concurrently; refresh and try again");
    throw error;
  }
}

export async function listPendingRescheduleProposals(db: Database, actorId: string, tripId: string) {
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { viewerId: true, operatorId: true } });
  if (!trip || !party(trip, actorId)) return fail(404, "Journey not found");
  const proposal = await db.scheduledJourneyRescheduleProposal.findFirst({ where: { tripId, status: ScheduledJourneyRescheduleStatus.PENDING }, orderBy: { createdAt: "desc" } });
  return { ok: true as const, value: proposal ? safe(proposal, trip, actorId) : null };
}

export async function acceptRescheduleProposal(db: Database, actorId: string, tripId: string, proposalId: string, now = new Date()) {
  if (!uuid(proposalId)) return fail(404, "Reschedule proposal not found");
  try {
    return await serializable(db, async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Trip" WHERE "id" = ${tripId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ScheduledJourneyRescheduleProposal" WHERE "id" = ${proposalId}::uuid FOR UPDATE`);
      const trip = await tx.trip.findUnique({ where: { id: tripId }, include: { agreement: true, scheduledReservations: { where: { status: "CONFIRMED" }, take: 2 } } });
      const proposal = await tx.scheduledJourneyRescheduleProposal.findUnique({ where: { id: proposalId } });
      if (!trip || !proposal || proposal.tripId !== tripId || proposal.agreementId !== trip.agreement?.id || !party(trip, actorId)) return fail(404, "Reschedule proposal not found");
      if (proposal.proposerId === actorId) return fail(409, "The proposer cannot accept their own reschedule proposal");
      if (proposal.status === ScheduledJourneyRescheduleStatus.ACCEPTED) return { ok: true as const, value: safe(proposal, trip, actorId), accepted: false };
      if (proposal.status !== ScheduledJourneyRescheduleStatus.PENDING) return fail(409, "Reschedule proposal is no longer pending");
      if (trip.status !== TripStatus.ACCEPTED || trip.immediate || trip.scheduledReservations.length !== 1 || proposal.proposedStartAt <= now) return fail(409, "Journey cannot be rescheduled");
      const current = trip.scheduledReservations[0];
      if (current.id !== proposal.fromReservationId || current.tripId !== trip.id || current.agreementId !== trip.agreement!.id || proposal.proposedEndAt <= proposal.proposedStartAt) return fail(409, "Reschedule proposal no longer matches the current Journey schedule");
      const released = await tx.scheduledJourneyReservation.updateMany({ where: { id: current.id, tripId, agreementId: trip.agreement!.id, status: "CONFIRMED", releasedAt: null }, data: { status: "RELEASED", releasedAt: now } });
      if (released.count !== 1) throw new Error("RESCHEDULE_SOURCE_CHANGED");
      const replacement = await tx.scheduledJourneyReservation.create({ data: { teleporterId: trip.operatorId!, agreementId: trip.agreement!.id, tripId, startAt: proposal.proposedStartAt, endAt: proposal.proposedEndAt, status: "CONFIRMED" } });
      const amended = await tx.scheduledJourneyRescheduleProposal.updateMany({ where: { id: proposal.id, tripId, agreementId: trip.agreement!.id, status: ScheduledJourneyRescheduleStatus.PENDING, replacementReservationId: null, resolvedAt: null }, data: { status: ScheduledJourneyRescheduleStatus.ACCEPTED, replacementReservationId: replacement.id, resolvedAt: now } });
      if (amended.count !== 1) throw new Error("RESCHEDULE_STATE_CHANGED");
      return { ok: true as const, value: safe(await tx.scheduledJourneyRescheduleProposal.findUniqueOrThrow({ where: { id: proposal.id } }), trip, actorId), accepted: true };
    });
  } catch (error) {
    if (schedulingConflict(error)) return fail(409, "The Teleporter is no longer available for the selected Journey time.");
    if (retryable(error) || (error instanceof Error && ["RESCHEDULE_SOURCE_CHANGED", "RESCHEDULE_STATE_CHANGED"].includes(error.message))) return fail(409, "Reschedule changed concurrently; refresh and try again");
    throw error;
  }
}

async function resolveRescheduleProposal(db: Database, actorId: string, tripId: string, proposalId: string, action: "DECLINED" | "WITHDRAWN", now: Date) {
  if (!uuid(proposalId)) return fail(404, "Reschedule proposal not found");
  return serializable(db, async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Trip" WHERE "id" = ${tripId} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ScheduledJourneyRescheduleProposal" WHERE "id" = ${proposalId}::uuid FOR UPDATE`);
    const trip = await tx.trip.findUnique({ where: { id: tripId }, select: { viewerId: true, operatorId: true } });
    const proposal = await tx.scheduledJourneyRescheduleProposal.findUnique({ where: { id: proposalId } });
    if (!trip || !proposal || proposal.tripId !== tripId || !party(trip, actorId)) return fail(404, "Reschedule proposal not found");
    const authorized = action === "WITHDRAWN" ? proposal.proposerId === actorId : proposal.proposerId !== actorId;
    if (!authorized) return fail(409, action === "WITHDRAWN" ? "Only the proposer may withdraw this reschedule proposal" : "Only the counterparty may decline this reschedule proposal");
    if (proposal.status === action) return { ok: true as const, value: safe(proposal, trip, actorId), resolved: false };
    if (proposal.status !== ScheduledJourneyRescheduleStatus.PENDING) return fail(409, "Reschedule proposal is no longer pending");
    const updated = await tx.scheduledJourneyRescheduleProposal.update({ where: { id: proposal.id }, data: { status: action, resolvedAt: now } });
    return { ok: true as const, value: safe(updated, trip, actorId), resolved: true };
  });
}
export const declineRescheduleProposal = (db: Database, actorId: string, tripId: string, proposalId: string, now = new Date()) => resolveRescheduleProposal(db, actorId, tripId, proposalId, "DECLINED", now);
export const withdrawRescheduleProposal = (db: Database, actorId: string, tripId: string, proposalId: string, now = new Date()) => resolveRescheduleProposal(db, actorId, tripId, proposalId, "WITHDRAWN", now);
