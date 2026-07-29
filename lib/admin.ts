import "server-only";

import { AccountStatus, OperatorPilotStatus, Prisma, Role, type PrismaClient } from "@prisma/client";
import { ALLOWED_DURATIONS, profileIsComplete } from "@/lib/marketplace";
import { publicDisplayName } from "@/lib/profiles";

export const ADMIN_PAGE_LIMIT = 20;
export const ADMIN_MAX_LIMIT = 50;

const participantSelect = {
  id: true, name: true, role: true, accountStatus: true, deactivatedAt: true, online: true,
  pendingOfferTripId: true, activeTripId: true, createdAt: true,
  operatorProfile: { select: { pilotStatus: true, operatingArea: true, serviceRadiusKm: true, supportsCustom: true, languages: true, accessibilityCapabilities: true, durationOptions: true } },
  destinationServices: { where: { destination: { active: true } }, select: { destinationId: true } },
} satisfies Prisma.UserSelect;

type AdminParticipantRecord = Prisma.UserGetPayload<{ select: typeof participantSelect }>;

export function projectAdminParticipant(user: AdminParticipantRecord, actorId: string) {
  const isCurrentAdmin = user.id === actorId;
  const canAssignAdministrator = !isCurrentAdmin && user.accountStatus === AccountStatus.ACTIVE && (user.role === Role.VIEWER || user.role === Role.OPERATOR);
  const canRemoveAdministrator = !isCurrentAdmin && user.role === Role.ADMIN;
  const administratorActionBlockedReason = isCurrentAdmin
    ? "SELF_ACTION"
    : user.accountStatus !== AccountStatus.ACTIVE && user.role !== Role.ADMIN
      ? "TARGET_INACTIVE"
      : !canAssignAdministrator && !canRemoveAdministrator ? "UNSUPPORTED_ROLE" : null;
  return {
    reference: user.id,
    displayName: publicDisplayName(user.name) || "Unnamed participant",
    role: user.role,
    accountStatus: user.accountStatus,
    deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
    isCurrentAdmin,
    canAssignAdministrator,
    canRemoveAdministrator,
    administratorActionBlockedReason,
    joinedDate: user.createdAt.toISOString().slice(0, 10),
    ...(user.role === Role.OPERATOR ? { pilotStatus: user.operatorProfile?.pilotStatus ?? OperatorPilotStatus.PENDING, online: user.online, activeState: user.activeTripId ? "ACTIVE_VISIT" : user.pendingOfferTripId ? "ACTIVE_OFFER" : "AVAILABLE", profileComplete: profileIsComplete(user.operatorProfile, user.destinationServices.length, user.operatorProfile?.supportsCustom ?? false, publicDisplayName(user.name)) } : {}),
  };
}

export function parseParticipantQuery(params: URLSearchParams) {
  const limit = Number(params.get("limit") ?? ADMIN_PAGE_LIMIT);
  const role = params.get("role") ?? "";
  const status = params.get("status") ?? "";
  const accountStatus = params.get("accountStatus") ?? "";
  const search = (params.get("search") ?? "").trim().replace(/\s+/g, " ");
  const page = Number(params.get("page") ?? 1);
  if (!Number.isInteger(limit) || limit < 1 || limit > ADMIN_MAX_LIMIT || !Number.isInteger(page) || page < 1 || page > 1000 || !["", "VIEWER", "OPERATOR", "ADMIN"].includes(role) || !["", ...Object.values(OperatorPilotStatus)].includes(status) || !["", ...Object.values(AccountStatus)].includes(accountStatus) || search.length > 80) return null;
  return { limit, page, role: role as "" | "VIEWER" | "OPERATOR" | "ADMIN", status: status as "" | OperatorPilotStatus, accountStatus: accountStatus as "" | AccountStatus, search };
}

export async function listAdminParticipants(db: PrismaClient, input: NonNullable<ReturnType<typeof parseParticipantQuery>>, actorId: string) {
  const where: Prisma.UserWhereInput = {
    role: input.role || { in: [Role.VIEWER, Role.OPERATOR, Role.ADMIN] },
    name: input.search ? { contains: input.search, mode: "insensitive" } : undefined,
    operatorProfile: input.status ? { is: { pilotStatus: input.status } } : undefined,
    accountStatus: input.accountStatus || undefined,
  };
  const users = await db.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (input.page - 1) * input.limit, take: input.limit, select: participantSelect });
  return users.map(user => projectAdminParticipant(user, actorId));
}

export async function getAdminParticipant(db: PrismaClient, targetId: string, actorId: string) {
  const user = await db.user.findUnique({ where: { id: targetId }, select: participantSelect });
  return user ? projectAdminParticipant(user, actorId) : null;
}

const DESTINATION_FIELDS = new Set(["name", "shortDescription", "city", "meetingArea", "category", "durationOptions", "imageUrl", "custom", "active", "expectedUpdatedAt"]);
export function validateAdminDestination(body: Record<string, unknown>, creating: boolean) {
  if (Object.keys(body).some(key => !DESTINATION_FIELDS.has(key)) || (creating && "expectedUpdatedAt" in body)) return { ok: false as const, status: 400, error: "Unsupported destination field" };
  const text = (key: string, max: number) => typeof body[key] === "string" ? body[key].trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
  const name = text("name", 100), shortDescription = text("shortDescription", 240), city = text("city", 80), meetingArea = text("meetingArea", 160), category = text("category", 60);
  const durationOptions = Array.isArray(body.durationOptions) ? [...new Set(body.durationOptions.map(Number))] : [];
  const imageUrl = body.imageUrl === null || body.imageUrl === "" ? null : typeof body.imageUrl === "string" ? body.imageUrl.trim() : undefined;
  if (!name || name.length > 100 || !shortDescription || shortDescription.length > 240 || !city || city.length > 80 || !meetingArea || meetingArea.length > 160 || !category || category.length > 60 || !durationOptions.length || durationOptions.some(value => !ALLOWED_DURATIONS.includes(value as never)) || imageUrl === undefined || (imageUrl && (!imageUrl.startsWith("https://") || imageUrl.length > 500)) || typeof body.custom !== "boolean" || typeof body.active !== "boolean") return { ok: false as const, status: 400, error: "Check the destination details" };
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" && !Number.isNaN(Date.parse(body.expectedUpdatedAt)) ? new Date(body.expectedUpdatedAt) : null;
  if (!creating && !expectedUpdatedAt) return { ok: false as const, status: 400, error: "Destination version is required" };
  return { ok: true as const, value: { name, shortDescription, city, meetingArea, category, durationOptions, imageUrl, custom: body.custom, active: body.active, expectedUpdatedAt } };
}

export function destinationSlug(name: string) { return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80); }
