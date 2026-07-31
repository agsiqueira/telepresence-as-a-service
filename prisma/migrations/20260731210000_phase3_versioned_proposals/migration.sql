CREATE TYPE "ProposalStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'WITHDRAWN', 'DECLINED', 'EXPIRED');

CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "journeyRequestId" TEXT NOT NULL,
    "teleporterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "revisesProposalId" TEXT,
    "earliestStart" TIMESTAMP(3) NOT NULL,
    "latestStart" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL,
    "proposedPriceMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminalAt" TIMESTAMP(3),
    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Proposal_version_check" CHECK ("version" >= 1),
    CONSTRAINT "Proposal_window_check" CHECK ("latestStart" IS NULL OR "latestStart" > "earliestStart"),
    CONSTRAINT "Proposal_duration_check" CHECK ("durationMinutes" BETWEEN 15 AND 480),
    CONSTRAINT "Proposal_price_check" CHECK ("proposedPriceMinor" BETWEEN 0 AND 10000000),
    CONSTRAINT "Proposal_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "Proposal_validity_check" CHECK ("validUntil" > "createdAt" AND "validUntil" <= "earliestStart"),
    CONSTRAINT "Proposal_lineage_check" CHECK (("version" = 1 AND "revisesProposalId" IS NULL) OR ("version" > 1 AND "revisesProposalId" IS NOT NULL)),
    CONSTRAINT "Proposal_lifecycle_check" CHECK (("status" = 'ACTIVE' AND "terminalAt" IS NULL) OR ("status" <> 'ACTIVE' AND "terminalAt" IS NOT NULL))
);

CREATE UNIQUE INDEX "Proposal_revisesProposalId_key" ON "Proposal"("revisesProposalId");
CREATE UNIQUE INDEX "Proposal_journeyRequestId_teleporterId_version_key" ON "Proposal"("journeyRequestId", "teleporterId", "version");
CREATE UNIQUE INDEX "Proposal_one_active_chain_key" ON "Proposal"("journeyRequestId", "teleporterId") WHERE "status" = 'ACTIVE';
CREATE INDEX "Proposal_journeyRequestId_status_validUntil_idx" ON "Proposal"("journeyRequestId", "status", "validUntil");
CREATE INDEX "Proposal_teleporterId_journeyRequestId_createdAt_idx" ON "Proposal"("teleporterId", "journeyRequestId", "createdAt");

ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_journeyRequestId_fkey" FOREIGN KEY ("journeyRequestId") REFERENCES "JourneyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_teleporterId_fkey" FOREIGN KEY ("teleporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_revisesProposalId_fkey" FOREIGN KEY ("revisesProposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_proposal_immutability"() RETURNS trigger AS $$
BEGIN
  IF OLD."journeyRequestId" IS DISTINCT FROM NEW."journeyRequestId" OR OLD."teleporterId" IS DISTINCT FROM NEW."teleporterId" OR OLD."version" IS DISTINCT FROM NEW."version" OR OLD."revisesProposalId" IS DISTINCT FROM NEW."revisesProposalId" OR OLD."earliestStart" IS DISTINCT FROM NEW."earliestStart" OR OLD."latestStart" IS DISTINCT FROM NEW."latestStart" OR OLD."durationMinutes" IS DISTINCT FROM NEW."durationMinutes" OR OLD."proposedPriceMinor" IS DISTINCT FROM NEW."proposedPriceMinor" OR OLD."currency" IS DISTINCT FROM NEW."currency" OR OLD."validUntil" IS DISTINCT FROM NEW."validUntil" OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Proposal authored terms are immutable';
  END IF;
  IF OLD."status" <> 'ACTIVE' OR NEW."status" = 'ACTIVE' THEN RAISE EXCEPTION 'Invalid Proposal lifecycle transition'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Proposal_immutable_transition" BEFORE UPDATE ON "Proposal" FOR EACH ROW EXECUTE FUNCTION "enforce_proposal_immutability"();

CREATE FUNCTION "prevent_proposal_delete"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Proposal history cannot be deleted'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "Proposal_prevent_delete" BEFORE DELETE ON "Proposal" FOR EACH ROW EXECUTE FUNCTION "prevent_proposal_delete"();
