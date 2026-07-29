import "server-only";

import type { PrismaClient } from "@prisma/client";

export async function getPersistedAccessState(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, accountStatus: true, createdAt: true } });
  if (!user) return null;
  const [roleAudit, lifecycleAudit] = await Promise.all([
    db.adminRoleChangeAudit.findFirst({ where: { targetId: userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.accountLifecycleAudit.findFirst({ where: { targetId: userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const updatedAt = [user.createdAt, roleAudit?.createdAt, lifecycleAudit?.createdAt].filter((value): value is Date => Boolean(value)).reduce((latest, value) => value > latest ? value : latest, user.createdAt);
  return { role: user.role, accountStatus: user.accountStatus, updatedAt: updatedAt.toISOString() };
}
