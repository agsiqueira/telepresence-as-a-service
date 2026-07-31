import "server-only";

import { Role, type User } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser, isAccountDeactivated } from "@/lib/current-user";
import { canAccessTeleporterObligation, hasExplorerCapability, hasTeleporterCapability } from "@/lib/capabilities";

export async function requirePageRole(requiredRole: Role): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (isAccountDeactivated(user)) {
    redirect("/account-deactivated");
  }

  if (user.role === requiredRole) {
    return user;
  }

  if (user.role === Role.VIEWER) redirect("/viewer");
  if (user.role === Role.OPERATOR) redirect("/operator");
  redirect("/");
}

export async function requireExplorerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (isAccountDeactivated(user)) redirect("/account-deactivated");
  if (!hasExplorerCapability(user)) redirect(user.role === Role.ADMIN ? "/admin/participants" : "/");
  return user;
}

export async function requireTeleporterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (isAccountDeactivated(user)) redirect("/account-deactivated");
  if (hasTeleporterCapability(user)) return user;
  if (user.role !== Role.ADMIN && user.operatorProfile) return user; // Pending profiles need setup; API guards still block fulfillment.
  const obligation = user.activeTripId ? await (await import("@/lib/db")).db.trip.findUnique({ where: { id: user.activeTripId }, select: { operatorId: true, status: true } }) : null;
  if (canAccessTeleporterObligation(user, obligation)) return user;
  redirect(user.role === Role.ADMIN ? "/admin/participants" : "/viewer");
}
