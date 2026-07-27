-- Extend the authoritative trip lifecycle without duplicating TripOffer history.
CREATE TYPE "TripStatus_new" AS ENUM (
  'REQUESTED',
  'OFFERED',
  'ACCEPTED',
  'IN_PROGRESS',
  'ENDED',
  'FEEDBACK_COMPLETED',
  'CANCELLED',
  'NO_OPERATOR_AVAILABLE'
);
ALTER TABLE "Trip" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Trip" ALTER COLUMN "status" TYPE "TripStatus_new" USING ("status"::text::"TripStatus_new");
DROP TYPE "TripStatus";
ALTER TYPE "TripStatus_new" RENAME TO "TripStatus";
ALTER TABLE "Trip" ALTER COLUMN "status" SET DEFAULT 'REQUESTED';

ALTER TABLE "Trip"
ADD COLUMN "offeredAt" TIMESTAMP(3),
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledBy" "Role",
ADD COLUMN "noOperatorAvailableAt" TIMESTAMP(3),
ADD COLUMN "feedbackCompletedAt" TIMESTAMP(3),
ADD COLUMN "feedbackSkippedAt" TIMESTAMP(3),
ADD COLUMN "retryOfTripId" TEXT;

CREATE UNIQUE INDEX "Trip_retryOfTripId_key" ON "Trip"("retryOfTripId");

-- Phase 3 represented an offered trip as REQUESTED plus offeredOperatorId.
-- Preserve those records by mapping them to the explicit Phase 4 state.
UPDATE "Trip"
SET "status" = 'OFFERED', "offeredAt" = COALESCE("requestedAt", CURRENT_TIMESTAMP)
WHERE "status" = 'REQUESTED' AND "offeredOperatorId" IS NOT NULL;
