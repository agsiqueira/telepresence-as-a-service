-- Safety Reporting Phase 1 adds confidential, participant-derived incident reports.
-- Existing Trips, Agreements, Feedback, JourneyReviews, and users are not rewritten.
CREATE TYPE "SafetyReportCategory" AS ENUM ('HARASSMENT', 'DISCRIMINATION', 'THREATENING_BEHAVIOR', 'UNSAFE_CONDUCT', 'PROPERTY_OR_PRIVACY_CONCERN', 'OTHER');
CREATE TYPE "SafetyReportSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "SafetyReportRole" AS ENUM ('EXPLORER', 'TELEPORTER');

CREATE TABLE "SafetyReport" (
  "id" UUID NOT NULL,
  "tripId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "reportedId" TEXT NOT NULL,
  "reporterRole" "SafetyReportRole" NOT NULL,
  "reportedRole" "SafetyReportRole" NOT NULL,
  "category" "SafetyReportCategory" NOT NULL,
  "severity" "SafetyReportSeverity" NOT NULL,
  "narrative" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SafetyReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SafetyReport_distinct_participants_check" CHECK ("reporterId" <> "reportedId"),
  CONSTRAINT "SafetyReport_opposite_roles_check" CHECK (("reporterRole" = 'EXPLORER' AND "reportedRole" = 'TELEPORTER') OR ("reporterRole" = 'TELEPORTER' AND "reportedRole" = 'EXPLORER')),
  CONSTRAINT "SafetyReport_narrative_length_check" CHECK ("narrative" = btrim("narrative") AND char_length("narrative") BETWEEN 10 AND 2000)
);
CREATE UNIQUE INDEX "SafetyReport_tripId_reporterId_key" ON "SafetyReport"("tripId", "reporterId");
CREATE INDEX "SafetyReport_createdAt_id_idx" ON "SafetyReport"("createdAt", "id");
CREATE INDEX "SafetyReport_reportedId_createdAt_idx" ON "SafetyReport"("reportedId", "createdAt");
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_reportedId_fkey" FOREIGN KEY ("reportedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
