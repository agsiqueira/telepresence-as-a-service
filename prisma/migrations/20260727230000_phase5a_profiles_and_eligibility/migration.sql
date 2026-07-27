-- Phase 5A adds persisted administration, privacy-safe viewer preferences,
-- and a single non-contradictory operator pilot status.
ALTER TYPE "Role" ADD VALUE 'ADMIN';

CREATE TYPE "OperatorPilotStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

ALTER TABLE "User"
ADD COLUMN "preferredLanguage" TEXT,
ADD COLUMN "accessibilityPreferences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "OperatorProfile"
ADD COLUMN "pilotStatus" "OperatorPilotStatus" NOT NULL DEFAULT 'PENDING';

-- Approval is now required for new assignments. Keep migrated operators safely offline
-- until an administrator deliberately reviews and approves them.
UPDATE "User" SET "online" = false WHERE "role" = 'OPERATOR';
