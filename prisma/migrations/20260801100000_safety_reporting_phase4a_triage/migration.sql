CREATE TYPE "SafetyReportTriageStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'ESCALATED', 'CLOSED_NO_ACTION');

ALTER TABLE "SafetyReport" ADD COLUMN "triageStatus" "SafetyReportTriageStatus" NOT NULL DEFAULT 'NEW';

CREATE TABLE "SafetyReportTriageEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "safetyReportId" UUID NOT NULL,
  "administratorId" TEXT NOT NULL,
  "previousStatus" "SafetyReportTriageStatus" NOT NULL,
  "newStatus" "SafetyReportTriageStatus" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SafetyReportTriageEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SafetyReportTriageEvent_status_change_check" CHECK ("previousStatus" <> "newStatus")
);

CREATE INDEX "SafetyReportTriageEvent_safetyReportId_createdAt_id_idx" ON "SafetyReportTriageEvent"("safetyReportId", "createdAt", "id");
ALTER TABLE "SafetyReportTriageEvent" ADD CONSTRAINT "SafetyReportTriageEvent_safetyReportId_fkey" FOREIGN KEY ("safetyReportId") REFERENCES "SafetyReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SafetyReportTriageEvent" ADD CONSTRAINT "SafetyReportTriageEvent_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
