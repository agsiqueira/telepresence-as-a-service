import "server-only";

import { AccountStatus, JourneyRequestStatus, OperatorPilotStatus, Prisma, ProposalStatus, Role, TripStatus, type PrismaClient } from "@prisma/client";
import { DISCOVERY_SELECT, JOURNEY_REQUEST_LIMITS, materializeExpiredJourneyRequests } from "@/lib/journey-requests";
import { profileIsComplete } from "@/lib/marketplace";
import { publicDisplayName } from "@/lib/profiles";

type Database = PrismaClient;
type Failure = { ok: false; status: 400 | 404 | 409; error: string };
const fail = (status: Failure["status"], error: string): Failure => ({ ok: false, status, error });
const currencies = new Set(["AUD", "BRL", "CAD", "CHF", "EUR", "GBP", "JPY", "MXN", "NZD", "USD"]);
const serializationFailure = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

async function serializable<T>(db: Database, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { if (!serializationFailure(error) || attempt >= 2) throw error; }
  }
}

export type ProposalInput = { earliestStart: Date; latestStart: Date | null; durationMinutes: number; proposedPriceMinor: number; currency: string; validUntil: Date };
type RequestTerms = { earliestStart: Date; latestStart: Date; expiresAt: Date; currency: string };

function date(value: unknown) { if (typeof value !== "string") return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed; }
export function validateProposalInput(body: Record<string, unknown>, request: RequestTerms, now = new Date()): { ok: true; value: ProposalInput } | Failure {
  const allowed = new Set(["earliestStart", "latestStart", "durationMinutes", "proposedPriceMinor", "currency", "validUntil"]);
  if (Object.keys(body).some(key => !allowed.has(key))) return fail(400, "Unsupported Proposal field");
  const latestProvided = !(body.latestStart === undefined || body.latestStart === "" || body.latestStart === null);
  const earliestStart = date(body.earliestStart), latestStart = latestProvided ? date(body.latestStart) : null, validUntil = date(body.validUntil);
  const durationMinutes = Number(body.durationMinutes), proposedPriceMinor = Number(body.proposedPriceMinor), currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  if (!earliestStart || (latestProvided && !latestStart) || !validUntil) return fail(400, "Check the required Proposal terms");
  if (earliestStart < request.earliestStart || earliestStart > request.latestStart || (latestStart && (latestStart <= earliestStart || latestStart > request.latestStart))) return fail(400, "Proposal timing must remain within the Journey Request window");
  if (!Number.isInteger(durationMinutes) || durationMinutes < JOURNEY_REQUEST_LIMITS.minDurationMinutes || durationMinutes > JOURNEY_REQUEST_LIMITS.maxDurationMinutes) return fail(400, "Duration must be between 15 and 480 minutes");
  if (!Number.isSafeInteger(proposedPriceMinor) || proposedPriceMinor < 0 || proposedPriceMinor > JOURNEY_REQUEST_LIMITS.maxPriceMinor) return fail(400, "Proposed price is outside the supported range");
  if (!currencies.has(currency) || currency !== request.currency) return fail(400, "Proposal currency must match the Journey Request");
  const boundary = Math.min(request.expiresAt.getTime(), earliestStart.getTime());
  if (validUntil <= now || validUntil.getTime() > boundary) return fail(400, "Proposal validity must end before request expiration and the proposed start");
  return { ok: true, value: { earliestStart, latestStart, durationMinutes, proposedPriceMinor, currency, validUntil } };
}

const TERMS_SELECT = { id: true, journeyRequestId: true, teleporterId: true, version: true, revisesProposalId: true, earliestStart: true, latestStart: true, durationMinutes: true, proposedPriceMinor: true, currency: true, validUntil: true, status: true, createdAt: true, terminalAt: true } satisfies Prisma.ProposalSelect;
const TELEPORTER_SELECT = { ...TERMS_SELECT, journeyRequest: { select: DISCOVERY_SELECT } } satisfies Prisma.ProposalSelect;
function safeTerms<T extends { teleporterId: string }>(proposal: T) { const { teleporterId: privateId, ...safe } = proposal; void privateId; return safe; }

async function materializeExpiredProposals(db: Prisma.TransactionClient | Database, now = new Date()) {
  return db.proposal.updateMany({ where: { status: ProposalStatus.ACTIVE, validUntil: { lte: now } }, data: { status: ProposalStatus.EXPIRED, terminalAt: now } });
}

async function eligibleRequest(tx: Prisma.TransactionClient, teleporterId: string, requestId: string, now: Date) {
  await materializeExpiredJourneyRequests(tx, now);
  await materializeExpiredProposals(tx, now);
  const [request, teleporter] = await Promise.all([
    tx.journeyRequest.findFirst({ where: { id: requestId, status: JourneyRequestStatus.OPEN, expiresAt: { gt: now }, explorer: { accountStatus: AccountStatus.ACTIVE } }, select: { id: true, explorerId: true, earliestStart: true, latestStart: true, expiresAt: true, currency: true, status: true } }),
    tx.user.findUnique({ where: { id: teleporterId }, select: { id: true, role: true, accountStatus: true, name: true, pendingOfferTripId: true, activeTripId: true, operatorProfile: true, destinationServices: { where: { destination: { active: true } }, select: { destinationId: true } }, tripsAsOperator: { where: { status: { in: [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS] } }, select: { id: true }, take: 1 } } }),
  ]);
  if (!request) return { error: fail(404, "Eligible Journey Request not found") } as const;
  if (!teleporter || teleporter.role === Role.ADMIN || teleporter.accountStatus !== AccountStatus.ACTIVE || teleporter.operatorProfile?.pilotStatus !== OperatorPilotStatus.APPROVED || teleporter.pendingOfferTripId || teleporter.activeTripId || teleporter.tripsAsOperator.length || !profileIsComplete(teleporter.operatorProfile, teleporter.destinationServices.length, teleporter.operatorProfile?.supportsCustom ?? false, publicDisplayName(teleporter.name))) return { error: fail(409, "Operational Teleporter capability is required") } as const;
  if (request.explorerId === teleporterId) return { error: fail(409, "A Teleporter cannot propose on their own Journey Request") } as const;
  return { request } as const;
}

export async function submitInitialProposal(db: Database, teleporterId: string, requestId: string, body: Record<string, unknown>, now = new Date()) {
  try { return await serializable(db, async tx => {
    const eligible = await eligibleRequest(tx, teleporterId, requestId, now); if ("error" in eligible) return eligible.error;
    if (await tx.proposal.count({ where: { journeyRequestId: requestId, teleporterId } })) return fail(409, "A Proposal chain already exists for this Journey Request");
    const input = validateProposalInput(body, eligible.request, now); if (!input.ok) return input;
    return { ok: true as const, value: safeTerms(await tx.proposal.create({ data: { journeyRequestId: requestId, teleporterId, version: 1, ...input.value }, select: TERMS_SELECT })) };
  }); } catch (error) { if (serializationFailure(error) || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) return fail(409, "A Proposal changed concurrently"); throw error; }
}

export async function reviseProposal(db: Database, teleporterId: string, proposalId: string, body: Record<string, unknown>, now = new Date()) {
  try { return await serializable(db, async tx => {
    await materializeExpiredProposals(tx, now);
    const previous = await tx.proposal.findFirst({ where: { id: proposalId, teleporterId }, select: TERMS_SELECT });
    if (!previous) return fail(404, "Proposal not found");
    if (previous.status !== ProposalStatus.ACTIVE || previous.validUntil <= now) return fail(409, "Proposal can no longer be revised");
    const eligible = await eligibleRequest(tx, teleporterId, previous.journeyRequestId, now); if ("error" in eligible) return eligible.error;
    const input = validateProposalInput(body, eligible.request, now); if (!input.ok) return input;
    const claimed = await tx.proposal.updateMany({ where: { id: proposalId, teleporterId, status: ProposalStatus.ACTIVE, validUntil: { gt: now } }, data: { status: ProposalStatus.SUPERSEDED, terminalAt: now } });
    if (claimed.count !== 1) return fail(409, "Proposal changed concurrently");
    const next = await tx.proposal.create({ data: { journeyRequestId: previous.journeyRequestId, teleporterId, version: previous.version + 1, revisesProposalId: previous.id, ...input.value }, select: TERMS_SELECT });
    return { ok: true as const, value: safeTerms(next) };
  }); } catch (error) { if (serializationFailure(error) || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) return fail(409, "Proposal changed concurrently"); throw error; }
}

async function terminalTeleporterAction(db: Database, teleporterId: string, proposalId: string, now: Date) {
  return serializable(db, async tx => {
    await materializeExpiredProposals(tx, now);
    const proposal = await tx.proposal.findFirst({ where: { id: proposalId, teleporterId }, select: TERMS_SELECT });
    if (!proposal) return fail(404, "Proposal not found");
    if (proposal.status === ProposalStatus.WITHDRAWN) return { ok: true as const, value: safeTerms(proposal) };
    if (proposal.status !== ProposalStatus.ACTIVE) return fail(409, "Proposal can no longer be withdrawn");
    const changed = await tx.proposal.updateMany({ where: { id: proposalId, teleporterId, status: ProposalStatus.ACTIVE, validUntil: { gt: now } }, data: { status: ProposalStatus.WITHDRAWN, terminalAt: now } });
    if (changed.count !== 1) return fail(409, "Proposal changed concurrently");
    return { ok: true as const, value: safeTerms(await tx.proposal.findUniqueOrThrow({ where: { id: proposalId }, select: TERMS_SELECT })) };
  });
}
export async function withdrawProposal(db: Database, teleporterId: string, proposalId: string, now = new Date()) { try { return await terminalTeleporterAction(db, teleporterId, proposalId, now); } catch (error) { if (serializationFailure(error)) return fail(409, "Proposal changed concurrently"); throw error; } }

export async function listTeleporterProposalHistory(db: Database, teleporterId: string, requestId: string, now = new Date()) { await materializeExpiredJourneyRequests(db, now); await materializeExpiredProposals(db, now); return (await db.proposal.findMany({ where: { journeyRequestId: requestId, teleporterId }, orderBy: { version: "desc" }, select: TELEPORTER_SELECT })).map(safeTerms); }

export async function listExplorerReceivedProposals(db: Database, explorerId: string, requestId: string, now = new Date()) {
  await materializeExpiredJourneyRequests(db, now); await materializeExpiredProposals(db, now);
  const request = await db.journeyRequest.findFirst({ where: { id: requestId, explorerId }, select: { id: true } }); if (!request) return null;
  const proposals = await db.proposal.findMany({ where: { journeyRequestId: requestId }, orderBy: [{ teleporterId: "asc" }, { version: "desc" }], select: { ...TERMS_SELECT, teleporter: { select: { name: true } } } });
  return proposals.map(({ teleporter, ...proposal }) => ({ ...safeTerms(proposal), teleporterName: publicDisplayName(teleporter.name) || "Verified Teleporter" }));
}

export async function listExplorerProposalHistory(db: Database, explorerId: string, requestId: string, proposalId: string, now = new Date()) {
  await materializeExpiredProposals(db, now);
  const selected = await db.proposal.findFirst({ where: { id: proposalId, journeyRequestId: requestId, journeyRequest: { explorerId } }, select: { teleporterId: true } });
  if (!selected) return null;
  const proposals = await db.proposal.findMany({ where: { journeyRequestId: requestId, teleporterId: selected.teleporterId }, orderBy: { version: "desc" }, select: { ...TERMS_SELECT, teleporter: { select: { name: true } } } });
  return proposals.map(({ teleporter, ...proposal }) => ({ ...safeTerms(proposal), teleporterName: publicDisplayName(teleporter.name) || "Verified Teleporter" }));
}

export async function declineProposal(db: Database, explorerId: string, requestId: string, proposalId: string, now = new Date()) {
  try { return await serializable(db, async tx => {
    await materializeExpiredProposals(tx, now);
    const proposal = await tx.proposal.findFirst({ where: { id: proposalId, journeyRequestId: requestId, journeyRequest: { explorerId } }, select: TERMS_SELECT });
    if (!proposal) return fail(404, "Proposal not found");
    if (proposal.status !== ProposalStatus.ACTIVE) return fail(409, "Proposal can no longer be declined");
    const changed = await tx.proposal.updateMany({ where: { id: proposalId, journeyRequestId: requestId, status: ProposalStatus.ACTIVE, validUntil: { gt: now } }, data: { status: ProposalStatus.DECLINED, terminalAt: now } });
    if (changed.count !== 1) return fail(409, "Proposal changed concurrently");
    return { ok: true as const, value: safeTerms(await tx.proposal.findUniqueOrThrow({ where: { id: proposalId }, select: TERMS_SELECT })) };
  }); } catch (error) { if (serializationFailure(error)) return fail(409, "Proposal changed concurrently"); throw error; }
}

export async function listAdminProposals(db: Database, now = new Date()) { await materializeExpiredProposals(db, now); return db.proposal.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: TERMS_SELECT }); }
