import { auth } from "@clerk/nextjs/server";
import { AccountStatus, Role, type User } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canInitiateTeleporterActivity, hasExplorerCapability } from "@/lib/capabilities";

export async function getCurrentUser() {
  const { userId } = auth();
  if (!userId) return null;

  const existing = await db.user.findUnique({ where: { clerkId: userId }, include: { operatorProfile: true } });
  if (existing) return existing;

  return db.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId, name: null },
    include: { operatorProfile: true },
  });
}

export async function getCurrentPersistedUser() {
  const { userId } = auth();
  return userId ? db.user.findUnique({ where: { clerkId: userId }, include: { operatorProfile: true } }) : null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthenticated");
  }
  return user;
}

export async function requireRole(requiredRole: Role): Promise<User | null> {
  const user = await getCurrentUser();
  return user?.role === requiredRole ? user : null;
}

export async function requireAdmin(): Promise<User | null> {
  const user = await requireCurrentUser();
  return user.role === Role.ADMIN ? user : null;
}

export const ACCOUNT_DEACTIVATED_CODE = "ACCOUNT_DEACTIVATED";
export const ACCOUNT_DEACTIVATED_MESSAGE = "This account has been deactivated. Contact an administrator for assistance.";

export function isAccountDeactivated(user: Pick<User, "accountStatus"> | null) {
  return user?.accountStatus === AccountStatus.DEACTIVATED;
}

export function deactivatedAccountApiResponse(user: Pick<User, "accountStatus"> | null) {
  return isAccountDeactivated(user)
    ? NextResponse.json(
        { error: ACCOUNT_DEACTIVATED_MESSAGE, code: ACCOUNT_DEACTIVATED_CODE },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      )
    : null;
}

export async function authorizeApiUser(requiredRole?: Role) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  const inactive = deactivatedAccountApiResponse(user);
  if (inactive) return { ok: false as const, response: inactive };
  if (requiredRole && user.role !== requiredRole) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true as const, user };
}

export async function authorizeExplorerApi() {
  const access = await authorizeApiUser();
  if (!access.ok) return access;
  return hasExplorerCapability(access.user)
    ? access
    : { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

export async function authorizeTeleporterActivityApi() {
  const access = await authorizeApiUser();
  if (!access.ok) return access;
  return canInitiateTeleporterActivity(access.user)
    ? access
    : { ok: false as const, response: NextResponse.json({ error: "Approved Teleporter capability is required" }, { status: 403 }) };
}
