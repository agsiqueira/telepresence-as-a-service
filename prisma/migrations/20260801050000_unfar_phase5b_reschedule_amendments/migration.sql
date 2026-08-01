-- Phase 5B preserves every existing reservation and introduces explicit,
-- mutually approved schedule-amendment history. Existing rows are not rewritten.
CREATE TYPE "ScheduledJourneyRescheduleStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'SUPERSEDED');

DROP INDEX "ScheduledJourneyReservation_agreementId_key";
DROP INDEX "ScheduledJourneyReservation_tripId_key";

CREATE INDEX "ScheduledJourneyReservation_agreementId_status_idx" ON "ScheduledJourneyReservation"("agreementId", "status");
CREATE INDEX "ScheduledJourneyReservation_tripId_status_idx" ON "ScheduledJourneyReservation"("tripId", "status");
CREATE UNIQUE INDEX "ScheduledJourneyReservation_one_confirmed_agreement" ON "ScheduledJourneyReservation"("agreementId") WHERE "status" = 'CONFIRMED';
CREATE UNIQUE INDEX "ScheduledJourneyReservation_one_confirmed_trip" ON "ScheduledJourneyReservation"("tripId") WHERE "status" = 'CONFIRMED';

CREATE TABLE "ScheduledJourneyRescheduleProposal" (
  "id" UUID NOT NULL,
  "agreementId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "proposerId" TEXT NOT NULL,
  "fromReservationId" UUID NOT NULL,
  "replacementReservationId" UUID,
  "proposedStartAt" TIMESTAMPTZ(3) NOT NULL,
  "proposedEndAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "ScheduledJourneyRescheduleStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  CONSTRAINT "ScheduledJourneyRescheduleProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduledJourneyRescheduleProposal_interval_check" CHECK ("proposedEndAt" > "proposedStartAt"),
  CONSTRAINT "ScheduledJourneyRescheduleProposal_state_check" CHECK (
    ("status" = 'PENDING' AND "resolvedAt" IS NULL AND "replacementReservationId" IS NULL) OR
    ("status" = 'ACCEPTED' AND "resolvedAt" IS NOT NULL AND "replacementReservationId" IS NOT NULL) OR
    ("status" IN ('DECLINED', 'WITHDRAWN', 'SUPERSEDED') AND "resolvedAt" IS NOT NULL AND "replacementReservationId" IS NULL)
  )
);

CREATE UNIQUE INDEX "ScheduledJourneyRescheduleProposal_replacementReservationId_key" ON "ScheduledJourneyRescheduleProposal"("replacementReservationId");
CREATE UNIQUE INDEX "ScheduledJourneyRescheduleProposal_one_pending_trip" ON "ScheduledJourneyRescheduleProposal"("tripId") WHERE "status" = 'PENDING';
CREATE INDEX "ScheduledJourneyRescheduleProposal_agreementId_createdAt_idx" ON "ScheduledJourneyRescheduleProposal"("agreementId", "createdAt");
CREATE INDEX "ScheduledJourneyRescheduleProposal_tripId_status_idx" ON "ScheduledJourneyRescheduleProposal"("tripId", "status");
CREATE INDEX "ScheduledJourneyRescheduleProposal_proposerId_createdAt_idx" ON "ScheduledJourneyRescheduleProposal"("proposerId", "createdAt");

ALTER TABLE "ScheduledJourneyRescheduleProposal" ADD CONSTRAINT "ScheduledJourneyRescheduleProposal_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduledJourneyRescheduleProposal" ADD CONSTRAINT "ScheduledJourneyRescheduleProposal_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduledJourneyRescheduleProposal" ADD CONSTRAINT "ScheduledJourneyRescheduleProposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduledJourneyRescheduleProposal" ADD CONSTRAINT "ScheduledJourneyRescheduleProposal_fromReservationId_fkey" FOREIGN KEY ("fromReservationId") REFERENCES "ScheduledJourneyReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduledJourneyRescheduleProposal" ADD CONSTRAINT "ScheduledJourneyRescheduleProposal_replacementReservationId_fkey" FOREIGN KEY ("replacementReservationId") REFERENCES "ScheduledJourneyReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
