-- Phase 5D.1 stores durable Viewer applications and their administrative review history.
CREATE TYPE "OperatorApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

CREATE TABLE "OperatorApplication" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "qualifications" TEXT NOT NULL,
    "relevantExperience" TEXT NOT NULL,
    "languages" TEXT[],
    "availability" TEXT NOT NULL,
    "supportingUrl" TEXT,
    "additionalNote" TEXT,
    "status" "OperatorApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperatorApplication_applicantId_submittedAt_idx"
ON "OperatorApplication"("applicantId", "submittedAt");

CREATE INDEX "OperatorApplication_status_submittedAt_idx"
ON "OperatorApplication"("status", "submittedAt");

CREATE INDEX "OperatorApplication_reviewedById_reviewedAt_idx"
ON "OperatorApplication"("reviewedById", "reviewedAt");

CREATE UNIQUE INDEX "OperatorApplication_one_pending_per_applicant"
ON "OperatorApplication" ("applicantId")
WHERE "status" = 'PENDING';

ALTER TABLE "OperatorApplication"
ADD CONSTRAINT "OperatorApplication_applicantId_fkey"
FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperatorApplication"
ADD CONSTRAINT "OperatorApplication_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
