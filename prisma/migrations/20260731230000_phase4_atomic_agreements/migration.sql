ALTER TYPE "ProposalStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "ProposalStatus" ADD VALUE 'NOT_SELECTED';

CREATE TYPE "AgreementStatus" AS ENUM ('CONFIRMED');

CREATE UNIQUE INDEX "Trip_id_viewerId_operatorId_key" ON "Trip"("id", "viewerId", "operatorId");
CREATE UNIQUE INDEX "JourneyRequest_id_explorerId_key" ON "JourneyRequest"("id", "explorerId");
CREATE UNIQUE INDEX "Proposal_id_journeyRequestId_teleporterId_key" ON "Proposal"("id", "journeyRequestId", "teleporterId");

CREATE TABLE "Agreement" (
  "id" TEXT NOT NULL,
  "journeyRequestId" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "explorerId" TEXT NOT NULL,
  "teleporterId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "agreedEarliestStart" TIMESTAMP(3) NOT NULL,
  "agreedLatestStart" TIMESTAMP(3),
  "agreedDurationMinutes" INTEGER NOT NULL,
  "agreedPriceMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "destinationIdSnapshot" TEXT,
  "publicPlaceNameSnapshot" VARCHAR(120) NOT NULL,
  "coarseLocationSnapshot" VARCHAR(120) NOT NULL,
  "privateMeetingSnapshot" VARCHAR(500),
  "status" "AgreementStatus" NOT NULL DEFAULT 'CONFIRMED',
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Agreement_window_check" CHECK ("agreedLatestStart" IS NULL OR "agreedLatestStart" > "agreedEarliestStart"),
  CONSTRAINT "Agreement_duration_check" CHECK ("agreedDurationMinutes" BETWEEN 15 AND 480),
  CONSTRAINT "Agreement_price_check" CHECK ("agreedPriceMinor" BETWEEN 0 AND 10000000),
  CONSTRAINT "Agreement_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Agreement_status_check" CHECK ("status" = 'CONFIRMED')
);

CREATE UNIQUE INDEX "Agreement_journeyRequestId_key" ON "Agreement"("journeyRequestId");
CREATE UNIQUE INDEX "Agreement_proposalId_key" ON "Agreement"("proposalId");
CREATE UNIQUE INDEX "Agreement_tripId_key" ON "Agreement"("tripId");
CREATE UNIQUE INDEX "Agreement_journeyRequestId_explorerId_key" ON "Agreement"("journeyRequestId", "explorerId");
CREATE UNIQUE INDEX "Agreement_proposalId_journeyRequestId_teleporterId_key" ON "Agreement"("proposalId", "journeyRequestId", "teleporterId");
CREATE UNIQUE INDEX "Agreement_tripId_explorerId_teleporterId_key" ON "Agreement"("tripId", "explorerId", "teleporterId");
CREATE INDEX "Agreement_explorerId_confirmedAt_idx" ON "Agreement"("explorerId", "confirmedAt");
CREATE INDEX "Agreement_teleporterId_confirmedAt_idx" ON "Agreement"("teleporterId", "confirmedAt");

ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_journeyRequest_owner_fkey" FOREIGN KEY ("journeyRequestId", "explorerId") REFERENCES "JourneyRequest"("id", "explorerId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_proposal_owner_fkey" FOREIGN KEY ("proposalId", "journeyRequestId", "teleporterId") REFERENCES "Proposal"("id", "journeyRequestId", "teleporterId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_explorerId_fkey" FOREIGN KEY ("explorerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_teleporterId_fkey" FOREIGN KEY ("teleporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_trip_parties_fkey" FOREIGN KEY ("tripId", "explorerId", "teleporterId") REFERENCES "Trip"("id", "viewerId", "operatorId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_agreement_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Agreement snapshots are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Agreement_prevent_update" BEFORE UPDATE ON "Agreement" FOR EACH ROW EXECUTE FUNCTION "prevent_agreement_change"();
CREATE TRIGGER "Agreement_prevent_delete" BEFORE DELETE ON "Agreement" FOR EACH ROW EXECUTE FUNCTION "prevent_agreement_change"();
