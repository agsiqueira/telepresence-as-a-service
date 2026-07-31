import "server-only";

import { AccountStatus, JourneyRequestStatus, Prisma, Role, type PrismaClient } from "@prisma/client";

type Database = PrismaClient;
const CURRENCIES = new Set(["AUD", "BRL", "CAD", "CHF", "EUR", "GBP", "JPY", "MXN", "NZD", "USD"]);
export const JOURNEY_REQUEST_LIMITS = { minDurationMinutes: 15, maxDurationMinutes: 480, maxPriceMinor: 10_000_000, maxWindowDays: 90 } as const;

export type JourneyRequestInput = {
  destinationId?: string;
  publicPlaceName: string;
  coarseLocation: string;
  privateMeetingDetails?: string;
  earliestStart: Date;
  latestStart: Date;
  durationMinutes: number;
  proposedPriceMinor: number;
  currency: string;
  expiresAt: Date;
};

type Failure = { ok: false; status: 400 | 404 | 409; error: string };
const fail = (status: Failure["status"], error: string): Failure => ({ ok: false, status, error });
const serializationFailure = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

async function serializable<T>(db: Database, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { if (!serializationFailure(error) || attempt >= 2) throw error; }
  }
}

function normalizedText(value: unknown, max: number, required = true) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if ((required && text.length < 2) || text.length > max || /[\u0000-\u001F\u007F]/.test(text)) return null;
  return text || (required ? null : "");
}

function parsedDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function validateJourneyRequestInput(body: Record<string, unknown>, now = new Date()): { ok: true; value: JourneyRequestInput } | Failure {
  const allowed = new Set(["destinationId", "publicPlaceName", "coarseLocation", "privateMeetingDetails", "earliestStart", "latestStart", "durationMinutes", "proposedPriceMinor", "currency", "expiresAt"]);
  if (Object.keys(body).some(key => !allowed.has(key))) return fail(400, "Unsupported Journey Request field");
  const destinationId = body.destinationId === undefined || body.destinationId === "" ? undefined : normalizedText(body.destinationId, 64);
  const publicPlaceName = normalizedText(body.publicPlaceName, 120);
  const coarseLocation = normalizedText(body.coarseLocation, 120);
  const privateMeetingDetails = body.privateMeetingDetails === undefined || body.privateMeetingDetails === "" ? undefined : normalizedText(body.privateMeetingDetails, 500, false);
  const earliestStart = parsedDate(body.earliestStart), latestStart = parsedDate(body.latestStart), expiresAt = parsedDate(body.expiresAt);
  const durationMinutes = Number(body.durationMinutes), proposedPriceMinor = Number(body.proposedPriceMinor);
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  if (!publicPlaceName || !coarseLocation || destinationId === null || privateMeetingDetails === null || !earliestStart || !latestStart || !expiresAt) return fail(400, "Check the required Journey Request details");
  if (earliestStart <= now || latestStart <= earliestStart || latestStart.getTime() - earliestStart.getTime() > JOURNEY_REQUEST_LIMITS.maxWindowDays * 86_400_000) return fail(400, "Choose a valid future start window");
  if (expiresAt <= now || expiresAt > latestStart) return fail(400, "Expiration must be in the future and no later than the latest start");
  if (!Number.isInteger(durationMinutes) || durationMinutes < JOURNEY_REQUEST_LIMITS.minDurationMinutes || durationMinutes > JOURNEY_REQUEST_LIMITS.maxDurationMinutes) return fail(400, "Duration must be between 15 and 480 minutes");
  if (!Number.isSafeInteger(proposedPriceMinor) || proposedPriceMinor < 0 || proposedPriceMinor > JOURNEY_REQUEST_LIMITS.maxPriceMinor) return fail(400, "Proposed price is outside the supported range");
  if (!CURRENCIES.has(currency)) return fail(400, "Choose a supported ISO 4217 currency");
  return { ok: true, value: { destinationId, publicPlaceName, coarseLocation, privateMeetingDetails, earliestStart, latestStart, durationMinutes, proposedPriceMinor, currency, expiresAt } };
}

export const OWNER_LIST_SELECT = {
  id: true, publicPlaceName: true, coarseLocation: true, earliestStart: true, latestStart: true,
  durationMinutes: true, proposedPriceMinor: true, currency: true, expiresAt: true, status: true,
  destinationId: true, tripId: true, createdAt: true, updatedAt: true, withdrawnAt: true, convertedAt: true,
} satisfies Prisma.JourneyRequestSelect;

export const OWNER_DETAIL_SELECT = { ...OWNER_LIST_SELECT, privateMeetingDetails: true } satisfies Prisma.JourneyRequestSelect;

export const DISCOVERY_SELECT = {
  id: true, publicPlaceName: true, coarseLocation: true, earliestStart: true, latestStart: true,
  durationMinutes: true, proposedPriceMinor: true, currency: true, expiresAt: true, destinationId: true, createdAt: true,
} satisfies Prisma.JourneyRequestSelect;

export const ADMIN_SELECT = { ...DISCOVERY_SELECT, status: true, updatedAt: true, withdrawnAt: true, convertedAt: true, tripId: true } satisfies Prisma.JourneyRequestSelect;

export async function materializeExpiredJourneyRequests(db: Database | Prisma.TransactionClient, now = new Date()) {
  return db.journeyRequest.updateMany({ where: { status: JourneyRequestStatus.OPEN, expiresAt: { lte: now } }, data: { status: JourneyRequestStatus.EXPIRED, updatedAt: now } });
}

export async function createJourneyRequest(db: Database, explorerId: string, input: JourneyRequestInput, now = new Date()) {
  try {
    return await serializable(db, async tx => {
      const explorer = await tx.user.findUnique({ where: { id: explorerId }, select: { role: true, accountStatus: true } });
      if (!explorer || explorer.accountStatus !== AccountStatus.ACTIVE || explorer.role === Role.ADMIN) return fail(404, "Explorer not found");
      if (input.expiresAt <= now || input.latestStart <= input.earliestStart) return fail(409, "Journey Request window is no longer valid");
      if (input.destinationId) {
        const destination = await tx.destination.count({ where: { id: input.destinationId, active: true } });
        if (!destination) return fail(400, "Destination is unavailable");
      }
      const request = await tx.journeyRequest.create({ data: { explorerId, ...input }, select: OWNER_DETAIL_SELECT });
      return { ok: true as const, value: request };
    });
  } catch (error) {
    if (serializationFailure(error)) return fail(409, "Journey Request changed concurrently");
    throw error;
  }
}

export async function listOwnedJourneyRequests(db: Database, explorerId: string, now = new Date()) {
  await materializeExpiredJourneyRequests(db, now);
  return db.journeyRequest.findMany({ where: { explorerId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, select: OWNER_LIST_SELECT });
}

export async function getOwnedJourneyRequest(db: Database, explorerId: string, id: string, now = new Date()) {
  await materializeExpiredJourneyRequests(db, now);
  return db.journeyRequest.findFirst({ where: { id, explorerId }, select: OWNER_DETAIL_SELECT });
}

export async function withdrawJourneyRequest(db: Database, explorerId: string, id: string, now = new Date()) {
  try {
    return await serializable(db, async tx => {
      await materializeExpiredJourneyRequests(tx, now);
      const request = await tx.journeyRequest.findFirst({ where: { id, explorerId }, select: { id: true, status: true } });
      if (!request) return fail(404, "Journey Request not found");
      if (request.status === JourneyRequestStatus.WITHDRAWN) return { ok: true as const, value: await tx.journeyRequest.findUniqueOrThrow({ where: { id }, select: OWNER_DETAIL_SELECT }) };
      if (request.status !== JourneyRequestStatus.OPEN) return fail(409, "Journey Request can no longer be withdrawn");
      const changed = await tx.journeyRequest.updateMany({ where: { id, explorerId, status: JourneyRequestStatus.OPEN, expiresAt: { gt: now } }, data: { status: JourneyRequestStatus.WITHDRAWN, withdrawnAt: now, updatedAt: now } });
      if (changed.count !== 1) return fail(409, "Journey Request changed concurrently");
      return { ok: true as const, value: await tx.journeyRequest.findUniqueOrThrow({ where: { id }, select: OWNER_DETAIL_SELECT }) };
    });
  } catch (error) {
    if (serializationFailure(error)) return fail(409, "Journey Request changed concurrently");
    throw error;
  }
}

export async function discoverOpenJourneyRequests(db: Database, now = new Date()) {
  await materializeExpiredJourneyRequests(db, now);
  return db.journeyRequest.findMany({ where: { status: JourneyRequestStatus.OPEN, expiresAt: { gt: now } }, orderBy: [{ earliestStart: "asc" }, { createdAt: "asc" }], take: 50, select: DISCOVERY_SELECT });
}

export async function listAdminJourneyRequests(db: Database, now = new Date()) {
  await materializeExpiredJourneyRequests(db, now);
  return db.journeyRequest.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: ADMIN_SELECT });
}
