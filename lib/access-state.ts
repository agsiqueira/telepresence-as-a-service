import "server-only";

import { OperatorPilotStatus, type PrismaClient } from "@prisma/client";
import { hasExplorerCapability, hasTeleporterCapability } from "@/lib/capabilities";

export async function getPersistedAccessState(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, accountStatus: true, activeTripId: true, createdAt: true, operatorProfile: { select: { pilotStatus: true, updatedAt: true } } } });
  if (!user) return null;
  const [roleAudit, lifecycleAudit] = await Promise.all([
    db.adminRoleChangeAudit.findFirst({ where: { targetId: userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.accountLifecycleAudit.findFirst({ where: { targetId: userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const updatedAt = [user.createdAt, user.operatorProfile?.updatedAt, roleAudit?.createdAt, lifecycleAudit?.createdAt].filter((value): value is Date => Boolean(value)).reduce((latest, value) => value > latest ? value : latest, user.createdAt);
  const teleporterObligation = hasExplorerCapability(user) && user.operatorProfile?.pilotStatus === OperatorPilotStatus.SUSPENDED && Boolean(user.activeTripId);
  return { role: user.role, accountStatus: user.accountStatus, explorer: hasExplorerCapability(user), teleporter: hasTeleporterCapability(user), teleporterObligation, updatedAt: updatedAt.toISOString() };
}
