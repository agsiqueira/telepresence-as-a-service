-- Phase 5A.2 protects newly accepted scheduled Agreements only. Historical
-- Agreements and Trips are intentionally not backfilled or rewritten.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "ScheduledJourneyReservationStatus" AS ENUM ('CONFIRMED', 'RELEASED');

CREATE TABLE "ScheduledJourneyReservation" (
  "id" UUID NOT NULL,
  "teleporterId" TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "ScheduledJourneyReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMPTZ(3),
  CONSTRAINT "ScheduledJourneyReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduledJourneyReservation_interval_check" CHECK ("endAt" > "startAt"),
  CONSTRAINT "ScheduledJourneyReservation_state_check" CHECK (
    ("status" = 'CONFIRMED' AND "releasedAt" IS NULL) OR
    ("status" = 'RELEASED' AND "releasedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ScheduledJourneyReservation_agreementId_key" ON "ScheduledJourneyReservation"("agreementId");
CREATE UNIQUE INDEX "ScheduledJourneyReservation_tripId_key" ON "ScheduledJourneyReservation"("tripId");
CREATE INDEX "ScheduledJourneyReservation_teleporterId_startAt_idx" ON "ScheduledJourneyReservation"("teleporterId", "startAt");
CREATE INDEX "ScheduledJourneyReservation_status_startAt_idx" ON "ScheduledJourneyReservation"("status", "startAt");

ALTER TABLE "ScheduledJourneyReservation" ADD CONSTRAINT "ScheduledJourneyReservation_teleporterId_fkey" FOREIGN KEY ("teleporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduledJourneyReservation" ADD CONSTRAINT "ScheduledJourneyReservation_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduledJourneyReservation" ADD CONSTRAINT "ScheduledJourneyReservation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScheduledJourneyReservation" ADD CONSTRAINT "ScheduledJourneyReservation_no_confirmed_overlap"
  EXCLUDE USING gist (
    "teleporterId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  ) WHERE ("status" = 'CONFIRMED');

-- Safe rollback ordering: drop the exclusion constraint, foreign keys, indexes,
-- table, and enum in dependency order. Do not automatically drop btree_gist:
-- the extension may be shared by unrelated database objects.
