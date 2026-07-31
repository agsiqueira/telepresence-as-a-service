import "server-only";

import { OperatorPilotStatus, Prisma, Role, TripStatus, type PrismaClient } from "@prisma/client";
import { ALLOWED_ACCESSIBILITY, ALLOWED_DURATIONS, ALLOWED_LANGUAGES, normalizedList, profileIsComplete } from "@/lib/marketplace";

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const VIEWER_FIELDS = new Set(["displayName", "preferredLanguage", "accessibilityPreferences"]);
const OPERATOR_PRESENTATION_FIELDS = new Set(["displayName"]);

function hasOnlyFields(body: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(body).every(key => allowed.has(key));
}

export function publicDisplayName(name: string | null) {
  return name && !/\S+@\S+\.\S+/.test(name) ? name : "";
}

export function validateViewerProfile(body: Record<string, unknown>): Result<{ displayName: string; preferredLanguage: string | null; accessibilityPreferences: string[] }> {
  if (!hasOnlyFields(body, VIEWER_FIELDS)) return { ok: false, status: 400, error: "Unsupported profile field" };
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().replace(/\s+/g, " ") : "";
  const preferredLanguage = typeof body.preferredLanguage === "string" ? body.preferredLanguage.trim() : "";
  const accessibilityPreferences = normalizedList(body.accessibilityPreferences, ALLOWED_ACCESSIBILITY, 5);
  if (displayName.length < 1 || displayName.length > 80 || /\S+@\S+\.\S+/.test(displayName)) return { ok: false, status: 400, error: "Enter a display name between 1 and 80 characters" };
  if (preferredLanguage && !ALLOWED_LANGUAGES.includes(preferredLanguage as never)) return { ok: false, status: 400, error: "Choose an available language" };
  if (!accessibilityPreferences) return { ok: false, status: 400, error: "Choose supported accessibility preferences" };
  return { ok: true, value: { displayName, preferredLanguage: preferredLanguage || null, accessibilityPreferences } };
}

export function validateOperatorPresentation(body: Record<string, unknown>): Result<{ displayName: string }> {
  if (!hasOnlyFields(body, OPERATOR_PRESENTATION_FIELDS)) return { ok: false, status: 400, error: "Unsupported profile field" };
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().replace(/\s+/g, " ") : "";
  if (displayName.length < 1 || displayName.length > 80 || /\S+@\S+\.\S+/.test(displayName)) return { ok: false, status: 400, error: "Enter a display name between 1 and 80 characters" };
  return { ok: true, value: { displayName } };
}

export type ReadinessCode = "READY" | "INCOMPLETE_PROFILE" | "AWAITING_APPROVAL" | "SUSPENDED" | "MISSING_SERVICE_CONFIGURATION" | "ACTIVE_ASSIGNMENT";
export type OperatorReadiness = { eligible: boolean; code: ReadinessCode; message: string };

export async function evaluateOperatorReadiness(db: PrismaClient, userId: string): Promise<OperatorReadiness> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      name: true,
      pendingOfferTripId: true,
      activeTripId: true,
      operatorProfile: true,
      destinationServices: { where: { destination: { active: true } }, select: { destinationId: true } },
      tripsAsOperator: { where: { status: { in: [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS] } }, select: { id: true }, take: 1 },
    },
  });
  if (!user || user.role === Role.ADMIN || !user.operatorProfile) return { eligible: false, code: "INCOMPLETE_PROFILE", message: "Complete your Teleporter profile before going online" };
  if (user.operatorProfile.pilotStatus === OperatorPilotStatus.PENDING) return { eligible: false, code: "AWAITING_APPROVAL", message: "Your profile is awaiting pilot approval" };
  if (user.operatorProfile.pilotStatus === OperatorPilotStatus.SUSPENDED) return { eligible: false, code: "SUSPENDED", message: "Your pilot participation is suspended" };
  if (user.pendingOfferTripId || user.activeTripId || user.tripsAsOperator.length) return { eligible: false, code: "ACTIVE_ASSIGNMENT", message: "Availability cannot change during an offer or active visit" };
  const profile = user.operatorProfile;
  if (!profileIsComplete(profile, user.destinationServices.length, profile.supportsCustom, publicDisplayName(user.name))) return { eligible: false, code: "MISSING_SERVICE_CONFIGURATION", message: "Complete your profile and service configuration before going online" };
  if (profile.languages.some(value => !ALLOWED_LANGUAGES.includes(value as never)) || profile.durationOptions.some(value => !ALLOWED_DURATIONS.includes(value as never))) return { eligible: false, code: "MISSING_SERVICE_CONFIGURATION", message: "Review your service configuration before going online" };
  return { eligible: true, code: "READY", message: "Ready to go online" };
}

export async function setOperatorPilotStatus(db: PrismaClient, userId: string, pilotStatus: OperatorPilotStatus, expectedStatus?: OperatorPilotStatus) {
 try {
  return await db.$transaction(async tx => {
    const operator = await tx.user.findFirst({ where: { id: userId, role: Role.OPERATOR }, select: { id: true, pendingOfferTripId: true, operatorProfile: { select: { userId: true, pilotStatus: true } } } });
    if (!operator?.operatorProfile) return { ok: false as const, status: 404 as const, error: "Operator not found" };
    if (operator.pendingOfferTripId) return { ok: false as const, status: 409 as const, error: "Operator has an active offer; try again later" };
    if (expectedStatus && operator.operatorProfile.pilotStatus !== expectedStatus) return { ok: false as const, status: 409 as const, error: "Pilot status changed; refresh and try again" };
    const allowed: Record<OperatorPilotStatus, OperatorPilotStatus[]> = {
      PENDING: [OperatorPilotStatus.APPROVED, OperatorPilotStatus.SUSPENDED],
      APPROVED: [OperatorPilotStatus.SUSPENDED],
      SUSPENDED: [OperatorPilotStatus.APPROVED, OperatorPilotStatus.PENDING],
    };
    if (operator.operatorProfile.pilotStatus !== pilotStatus && !allowed[operator.operatorProfile.pilotStatus].includes(pilotStatus)) return { ok: false as const, status: 409 as const, error: "Pilot status transition is not allowed" };
    const changed = await tx.operatorProfile.updateMany({ where: { userId, pilotStatus: operator.operatorProfile.pilotStatus }, data: { pilotStatus } });
    if (changed.count !== 1) return { ok: false as const, status: 409 as const, error: "Pilot status changed; refresh and try again" };
    await tx.user.update({ where: { id: userId }, data: { online: false } });
    return { ok: true as const, value: { pilotStatus, online: false } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
 } catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return { ok: false as const, status: 409 as const, error: "Operator state changed; refresh and try again" };
  throw error;
 }
}

export async function forceOperatorOffline(db: PrismaClient, userId: string) {
 try {
  return await db.$transaction(async tx => {
    const operator = await tx.user.findFirst({ where: { id: userId, role: Role.OPERATOR }, select: { id: true, pendingOfferTripId: true } });
    if (!operator) return { ok: false as const, status: 404 as const, error: "Operator not found" };
    if (operator.pendingOfferTripId) return { ok: false as const, status: 409 as const, error: "Operator has an active offer; try again later" };
    await tx.user.update({ where: { id: userId }, data: { online: false } });
    return { ok: true as const, value: { online: false } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
 } catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return { ok: false as const, status: 409 as const, error: "Operator state changed; refresh and try again" };
  throw error;
 }
}
