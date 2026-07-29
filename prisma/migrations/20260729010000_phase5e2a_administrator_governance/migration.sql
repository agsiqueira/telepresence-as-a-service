-- Phase 5E.2A extends role auditing for administrator governance while preserving historical rows.
BEGIN;

ALTER TYPE "AdminRoleChangeAction" ADD VALUE 'ASSIGN_ADMIN';
ALTER TYPE "AdminRoleChangeAction" ADD VALUE 'REMOVE_ADMIN';

COMMIT;

BEGIN;

ALTER TABLE "AdminRoleChangeAudit"
ADD COLUMN "reason" TEXT;

ALTER TABLE "AdminRoleChangeAudit"
ADD CONSTRAINT "AdminRoleChangeAudit_transition_check" CHECK (
    ("action" = 'ASSIGN_OPERATOR' AND "previousRole" = 'VIEWER' AND "newRole" = 'OPERATOR') OR
    ("action" = 'RETURN_TO_VIEWER' AND "previousRole" = 'OPERATOR' AND "newRole" = 'VIEWER') OR
    ("action" = 'ASSIGN_ADMIN' AND "previousRole" IN ('VIEWER', 'OPERATOR') AND "newRole" = 'ADMIN') OR
    ("action" = 'REMOVE_ADMIN' AND "previousRole" = 'ADMIN' AND "newRole" = 'VIEWER')
),
ADD CONSTRAINT "AdminRoleChangeAudit_governance_reason_check" CHECK (
    "action" IN ('ASSIGN_OPERATOR', 'RETURN_TO_VIEWER') OR
    ("reason" IS NOT NULL AND "reason" = btrim("reason") AND char_length("reason") BETWEEN 1 AND 500)
);

CREATE INDEX "AdminRoleChangeAudit_action_createdAt_idx"
ON "AdminRoleChangeAudit"("action", "createdAt");

COMMIT;
