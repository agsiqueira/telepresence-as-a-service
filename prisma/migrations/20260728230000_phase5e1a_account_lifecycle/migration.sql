-- Phase 5E.1A adds durable local account status and immutable lifecycle history.
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');
CREATE TYPE "AccountLifecycleAction" AS ENUM ('DEACTIVATE', 'REACTIVATE');

ALTER TABLE "User"
ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "deactivatedAt" TIMESTAMP(3);

CREATE INDEX "User_accountStatus_role_idx"
ON "User"("accountStatus", "role");

CREATE TABLE "AccountLifecycleAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" "AccountLifecycleAction" NOT NULL,
    "previousStatus" "AccountStatus" NOT NULL,
    "newStatus" "AccountStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountLifecycleAudit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountLifecycleAudit_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500),
    CONSTRAINT "AccountLifecycleAudit_transition_check" CHECK (
        ("action" = 'DEACTIVATE' AND "previousStatus" = 'ACTIVE' AND "newStatus" = 'DEACTIVATED') OR
        ("action" = 'REACTIVATE' AND "previousStatus" = 'DEACTIVATED' AND "newStatus" = 'ACTIVE')
    )
);

CREATE INDEX "AccountLifecycleAudit_targetId_createdAt_idx"
ON "AccountLifecycleAudit"("targetId", "createdAt");

CREATE INDEX "AccountLifecycleAudit_actorId_createdAt_idx"
ON "AccountLifecycleAudit"("actorId", "createdAt");

CREATE INDEX "AccountLifecycleAudit_action_createdAt_idx"
ON "AccountLifecycleAudit"("action", "createdAt");

ALTER TABLE "AccountLifecycleAudit"
ADD CONSTRAINT "AccountLifecycleAudit_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountLifecycleAudit"
ADD CONSTRAINT "AccountLifecycleAudit_targetId_fkey"
FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
