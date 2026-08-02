-- Phase 5F adds prospective simulated Tips only. It does not backfill or rewrite
-- any historical Journey or participant-domain row.
CREATE TABLE "SimulatedTip" (
  "id" UUID NOT NULL,
  "tripId" TEXT NOT NULL,
  "explorerId" TEXT NOT NULL,
  "teleporterId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SimulatedTip_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SimulatedTip_amount_check" CHECK ("amountMinor" IN (500, 1000, 1500, 2000)),
  CONSTRAINT "SimulatedTip_currency_check" CHECK ("currency" = 'USD')
);

CREATE UNIQUE INDEX "SimulatedTip_tripId_key" ON "SimulatedTip"("tripId");
CREATE UNIQUE INDEX "SimulatedTip_tripId_explorerId_teleporterId_key" ON "SimulatedTip"("tripId", "explorerId", "teleporterId");
CREATE INDEX "SimulatedTip_explorerId_submittedAt_idx" ON "SimulatedTip"("explorerId", "submittedAt");
CREATE INDEX "SimulatedTip_teleporterId_submittedAt_idx" ON "SimulatedTip"("teleporterId", "submittedAt");
ALTER TABLE "SimulatedTip" ADD CONSTRAINT "SimulatedTip_explorerId_fkey" FOREIGN KEY ("explorerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimulatedTip" ADD CONSTRAINT "SimulatedTip_teleporterId_fkey" FOREIGN KEY ("teleporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimulatedTip" ADD CONSTRAINT "SimulatedTip_trip_participants_fkey" FOREIGN KEY ("tripId", "explorerId", "teleporterId") REFERENCES "Trip"("id", "viewerId", "operatorId") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "validate_simulated_tip_journey"() RETURNS trigger AS $$
DECLARE journey "Trip"%ROWTYPE;
BEGIN
  SELECT * INTO journey FROM "Trip" WHERE "id" = NEW."tripId" FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'SimulatedTip_trip_participants_fkey', MESSAGE = 'Simulated Tip Journey does not exist';
  END IF;
  IF journey."status" NOT IN ('ENDED', 'FEEDBACK_COMPLETED') OR journey."endedAt" IS NULL
     OR journey."operatorId" IS NULL OR journey."viewerId" = journey."operatorId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'SimulatedTip_completed_journey_check', MESSAGE = 'Journey is not eligible for a simulated Tip';
  END IF;
  IF NEW."explorerId" <> journey."viewerId" OR NEW."teleporterId" <> journey."operatorId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'SimulatedTip_attribution_check', MESSAGE = 'Simulated Tip attribution does not match Journey participation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SimulatedTip_validate_journey" BEFORE INSERT ON "SimulatedTip" FOR EACH ROW EXECUTE FUNCTION "validate_simulated_tip_journey"();

CREATE FUNCTION "prevent_simulated_tip_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = CASE WHEN TG_OP = 'DELETE' THEN 'SimulatedTip_prevent_delete' ELSE 'SimulatedTip_prevent_update' END, MESSAGE = 'Simulated Tip is immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SimulatedTip_prevent_update" BEFORE UPDATE ON "SimulatedTip" FOR EACH ROW EXECUTE FUNCTION "prevent_simulated_tip_mutation"();
CREATE TRIGGER "SimulatedTip_prevent_delete" BEFORE DELETE ON "SimulatedTip" FOR EACH ROW EXECUTE FUNCTION "prevent_simulated_tip_mutation"();
