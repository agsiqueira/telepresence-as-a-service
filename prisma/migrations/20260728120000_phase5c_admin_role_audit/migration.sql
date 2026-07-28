-- Phase 5C.1 records the administrator and target for each participant-role change.
CREATE TYPE "AdminRoleChangeAction" AS ENUM ('ASSIGN_OPERATOR', 'RETURN_TO_VIEWER');

CREATE TABLE "AdminRoleChangeAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" "AdminRoleChangeAction" NOT NULL,
    "previousRole" "Role" NOT NULL,
    "newRole" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRoleChangeAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminRoleChangeAudit_targetId_createdAt_idx"
ON "AdminRoleChangeAudit"("targetId", "createdAt");

CREATE INDEX "AdminRoleChangeAudit_actorId_createdAt_idx"
ON "AdminRoleChangeAudit"("actorId", "createdAt");

ALTER TABLE "AdminRoleChangeAudit"
ADD CONSTRAINT "AdminRoleChangeAudit_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdminRoleChangeAudit"
ADD CONSTRAINT "AdminRoleChangeAudit_targetId_fkey"
FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
