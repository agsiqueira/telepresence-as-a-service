import "server-only";

import { Prisma, SafetyRestrictionEventType, SafetyRestrictionStatus } from "@prisma/client";

const LOCK_NAMESPACE = "safety-reporting-phase4d:participant:";

export async function acquireSafetyRestrictionParticipantLocks(
  tx: Prisma.TransactionClient,
  participantIds: readonly string[],
) {
  const orderedIds = [...new Set(participantIds)].sort();
  for (const participantId of orderedIds) {
    await tx.$queryRaw(
      Prisma.sql`SELECT 1::integer FROM (SELECT pg_advisory_xact_lock(hashtextextended(${LOCK_NAMESPACE + participantId}, 0))) AS acquired`,
    );
  }
  return orderedIds;
}

export async function finalizeExpiredRestrictionsInTransaction(
  tx: Prisma.TransactionClient,
  participantIds: readonly string[],
  now = new Date(),
) {
  const expired = await tx.safetyReportRestriction.findMany({
    where: {
      participantId: { in: [...new Set(participantIds)] },
      status: SafetyRestrictionStatus.ACTIVE,
      expiresAt: { lte: now },
    },
    select: { id: true },
  });
  for (const restriction of expired) {
    const changed = await tx.safetyReportRestriction.updateMany({
      where: { id: restriction.id, status: SafetyRestrictionStatus.ACTIVE, expiresAt: { lte: now } },
      data: { status: SafetyRestrictionStatus.EXPIRED, version: { increment: 1 } },
    });
    if (changed.count === 1) {
      await tx.safetyReportRestrictionEvent.create({
        data: { restrictionId: restriction.id, eventType: SafetyRestrictionEventType.EXPIRED, occurredAt: now },
      });
    }
  }
}

export async function hasEffectiveSafetyRestrictionInTransaction(
  tx: Prisma.TransactionClient,
  participantIds: readonly string[],
  now = new Date(),
) {
  await finalizeExpiredRestrictionsInTransaction(tx, participantIds, now);
  return Boolean(await tx.safetyReportRestriction.findFirst({
    where: {
      participantId: { in: [...new Set(participantIds)] },
      status: SafetyRestrictionStatus.ACTIVE,
      startsAt: { lte: now },
      expiresAt: { gt: now },
    },
    select: { id: true },
  }));
}
