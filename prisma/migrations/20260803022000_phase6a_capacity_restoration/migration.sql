CREATE TABLE "SupplyCapacityRestoration" (
  "id" UUID NOT NULL,
  "claimId" UUID NOT NULL,
  "tripId" TEXT NOT NULL,
  "listingId" UUID NOT NULL,
  "liveMomentId" UUID,
  "occurrenceId" UUID,
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplyCapacityRestoration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplyCapacityRestoration_interval_check" CHECK ("startAt" < "endAt")
);

CREATE UNIQUE INDEX "SupplyCapacityRestoration_claimId_key" ON "SupplyCapacityRestoration"("claimId");
CREATE UNIQUE INDEX "SupplyCapacityRestoration_tripId_key" ON "SupplyCapacityRestoration"("tripId");
CREATE INDEX "SupplyCapacityRestoration_listingId_startAt_endAt_idx" ON "SupplyCapacityRestoration"("listingId","startAt","endAt");
CREATE INDEX "SupplyCapacityRestoration_liveMomentId_startAt_endAt_idx" ON "SupplyCapacityRestoration"("liveMomentId","startAt","endAt");
ALTER TABLE "SupplyCapacityRestoration" ADD CONSTRAINT "SupplyCapacityRestoration_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SupplyCapacityClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyCapacityRestoration" ADD CONSTRAINT "SupplyCapacityRestoration_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyCapacityRestoration" ADD CONSTRAINT "SupplyCapacityRestoration_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "SupplyListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyCapacityRestoration" ADD CONSTRAINT "SupplyCapacityRestoration_liveMomentId_fkey" FOREIGN KEY ("liveMomentId") REFERENCES "LiveMoment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyCapacityRestoration" ADD CONSTRAINT "SupplyCapacityRestoration_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "GuidedExperienceOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplyCapacityClaim" DROP CONSTRAINT "SupplyCapacityClaim_no_teleporter_overlap";

CREATE FUNCTION "validate_supply_capacity_restoration"() RETURNS trigger AS $$
DECLARE c "SupplyCapacityClaim"%ROWTYPE; l "SupplyListing"%ROWTYPE; t "Trip"%ROWTYPE; live_expires timestamptz;
BEGIN
  SELECT * INTO l FROM "SupplyListing" WHERE "id"=NEW."listingId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restoration listing missing' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_provenance_check'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('phase6-claim-teleporter:'||l."teleporterId",0));
  SELECT * INTO c FROM "SupplyCapacityClaim" WHERE "id"=NEW."claimId" FOR UPDATE;
  SELECT * INTO t FROM "Trip" WHERE "id"=NEW."tripId" FOR KEY SHARE;
  IF c."status"<>'COMMITTED' OR c."tripId" IS DISTINCT FROM NEW."tripId" OR c."listingId" IS DISTINCT FROM NEW."listingId"
     OR c."liveMomentId" IS DISTINCT FROM NEW."liveMomentId" OR c."occurrenceId" IS DISTINCT FROM NEW."occurrenceId"
     OR t."status"<>'CANCELLED' OR t."startedAt" IS NOT NULL OR t."cancelledAt" IS NULL OR t."cancelledAt">=c."startAt"
     OR EXISTS(SELECT 1 FROM "ScheduledJourneyReservation" r WHERE r."tripId"=t."id" AND r."status"='CONFIRMED') THEN
    RAISE EXCEPTION 'Restoration provenance invalid' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_provenance_check';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Agreement" a
    JOIN "JourneyRequest" j ON j."id"=a."journeyRequestId"
    JOIN "Proposal" p ON p."id"=a."proposalId"
    WHERE a."id"=c."agreementId" AND a."tripId"=c."tripId" AND c."journeyRequestId"=j."id" AND c."proposalId"=p."id"
      AND j."tripId"=c."tripId" AND j."supplyListingId"=c."listingId" AND p."supplyListingId"=c."listingId"
      AND j."supplyListingVersion"=p."supplyListingVersion" AND j."explorerId"=c."explorerId"
      AND a."explorerId"=c."explorerId" AND a."teleporterId"=c."teleporterId"
      AND a."agreedStartAt"=c."startAt" AND a."agreedDurationMinutes"*interval '1 minute'=c."endAt"-c."startAt"
  ) THEN RAISE EXCEPTION 'Restoration provenance invalid' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_provenance_check'; END IF;
  IF l."status"<>'PUBLISHED' THEN RAISE EXCEPTION 'Restoration supply unavailable' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_supply_available_check'; END IF;
  IF c."liveMomentId" IS NOT NULL THEN
    SELECT "expiresAt" INTO live_expires FROM "LiveMoment" WHERE "id"=c."liveMomentId" AND "listingId"=l."id" AND c."startAt">="availabilityStart" AND c."endAt"<="availabilityEnd" AND c."endAt"=c."startAt"+l."durationMinutes"*interval '1 minute';
    IF live_expires IS NULL OR live_expires<=CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Restoration supply expired' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_supply_available_check'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM "SupplyCapacityClaim" other WHERE other."id"<>c."id" AND other."teleporterId"=c."teleporterId" AND other."status" IN ('HELD','COMMITTED') AND NOT (other."status"='COMMITTED' AND EXISTS(SELECT 1 FROM "SupplyCapacityRestoration" x WHERE x."claimId"=other."id")) AND tstzrange(other."startAt",other."endAt",'[)')&&tstzrange(c."startAt",c."endAt",'[)'))
     OR EXISTS(SELECT 1 FROM "ScheduledJourneyReservation" r WHERE r."tripId"<>c."tripId" AND r."teleporterId"=c."teleporterId" AND r."status"='CONFIRMED' AND tstzrange(r."startAt",r."endAt",'[)')&&tstzrange(c."startAt",c."endAt",'[)')) THEN
    RAISE EXCEPTION 'Restoration interval conflicts' USING ERRCODE='23P01', CONSTRAINT='SupplyCapacityRestoration_conflict_check';
  END IF;
  NEW."listingId":=c."listingId"; NEW."liveMomentId":=c."liveMomentId"; NEW."occurrenceId":=c."occurrenceId";
  NEW."tripId":=c."tripId"; NEW."startAt":=c."startAt"; NEW."endAt":=c."endAt"; NEW."createdAt":=CURRENT_TIMESTAMP;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "SupplyCapacityRestoration_validate_insert" BEFORE INSERT ON "SupplyCapacityRestoration" FOR EACH ROW EXECUTE FUNCTION "validate_supply_capacity_restoration"();

CREATE FUNCTION "protect_supply_capacity_restoration"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Supply capacity restorations are append-only' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_append_only';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "SupplyCapacityRestoration_prevent_update" BEFORE UPDATE ON "SupplyCapacityRestoration" FOR EACH ROW EXECUTE FUNCTION "protect_supply_capacity_restoration"();
CREATE TRIGGER "SupplyCapacityRestoration_prevent_delete" BEFORE DELETE ON "SupplyCapacityRestoration" FOR EACH ROW EXECUTE FUNCTION "protect_supply_capacity_restoration"();

CREATE OR REPLACE FUNCTION "validate_supply_claim_insert"() RETURNS trigger AS $$
DECLARE listing "SupplyListing"%ROWTYPE; window_start timestamptz; window_end timestamptz; target_capacity integer; active_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('phase6-claim-explorer:'||NEW."explorerId",0));
  SELECT * INTO listing FROM "SupplyListing" WHERE "id"=NEW."listingId" FOR UPDATE;
  IF NOT FOUND OR listing."status"<>'PUBLISHED' THEN RAISE EXCEPTION 'Supply unavailable' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_supply_available_check'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('phase6-claim-teleporter:'||listing."teleporterId",0));
  UPDATE "SupplyCapacityClaim" SET "status"='EXPIRED',"releasedAt"=CURRENT_TIMESTAMP WHERE "status"='HELD' AND "expiresAt"<=CURRENT_TIMESTAMP AND ("explorerId"=NEW."explorerId" OR "teleporterId"=listing."teleporterId");
  NEW."teleporterId":=listing."teleporterId"; NEW."status":='HELD'; NEW."createdAt":=CURRENT_TIMESTAMP; NEW."expiresAt":=CURRENT_TIMESTAMP+interval '10 minutes'; NEW."releasedAt":=NULL; NEW."committedAt":=NULL;
  IF listing."type"='LIVE_MOMENT' AND NEW."liveMomentId" IS NOT NULL AND NEW."occurrenceId" IS NULL THEN
    SELECT "availabilityStart","availabilityEnd",listing."capacity" INTO window_start,window_end,target_capacity FROM "LiveMoment" WHERE "id"=NEW."liveMomentId" AND "listingId"=listing."id" AND "expiresAt">CURRENT_TIMESTAMP FOR KEY SHARE;
  ELSIF listing."type"='GUIDED_EXPERIENCE' AND NEW."occurrenceId" IS NOT NULL AND NEW."liveMomentId" IS NULL THEN
    SELECT o."availabilityStart",o."availabilityEnd",o."capacity" INTO window_start,window_end,target_capacity FROM "GuidedExperienceOccurrence" o JOIN "GuidedExperience" g ON g."id"=o."guidedExperienceId" WHERE o."id"=NEW."occurrenceId" AND g."listingId"=listing."id" AND o."status"='PUBLISHED' AND o."availabilityEnd">CURRENT_TIMESTAMP FOR KEY SHARE OF o;
  ELSE RAISE EXCEPTION 'Supply claim target mismatch' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_target_type_check'; END IF;
  IF window_start IS NULL OR NEW."startAt"<window_start OR NEW."endAt">window_end OR NEW."endAt"<>NEW."startAt"+listing."durationMinutes"*interval '1 minute' THEN RAISE EXCEPTION 'Claim interval invalid' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_target_interval_check'; END IF;
  IF EXISTS(SELECT 1 FROM "SupplyCapacityClaim" c WHERE c."explorerId"=NEW."explorerId" AND c."status"='HELD' AND ((NEW."liveMomentId" IS NOT NULL AND c."liveMomentId"=NEW."liveMomentId") OR (NEW."occurrenceId" IS NOT NULL AND c."occurrenceId"=NEW."occurrenceId"))) THEN RAISE EXCEPTION 'Explorer already has target claim' USING ERRCODE='23505', CONSTRAINT='SupplyCapacityClaim_explorer_target_active_key'; END IF;
  SELECT count(*) INTO active_count FROM "SupplyCapacityClaim" WHERE "explorerId"=NEW."explorerId" AND "status"='HELD'; IF active_count>=3 THEN RAISE EXCEPTION 'Explorer active claim limit reached' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_explorer_global_limit'; END IF;
  SELECT count(*) INTO active_count FROM "SupplyCapacityClaim" c WHERE c."status" IN ('HELD','COMMITTED') AND NOT (c."status"='COMMITTED' AND EXISTS(SELECT 1 FROM "SupplyCapacityRestoration" x WHERE x."claimId"=c."id")) AND ((NEW."liveMomentId" IS NOT NULL AND c."liveMomentId"=NEW."liveMomentId") OR (NEW."occurrenceId" IS NOT NULL AND c."occurrenceId"=NEW."occurrenceId")); IF active_count>=target_capacity THEN RAISE EXCEPTION 'Supply capacity exhausted' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_capacity_check'; END IF;
  IF EXISTS(SELECT 1 FROM "SupplyCapacityClaim" c WHERE c."teleporterId"=listing."teleporterId" AND c."status" IN ('HELD','COMMITTED') AND NOT (c."status"='COMMITTED' AND EXISTS(SELECT 1 FROM "SupplyCapacityRestoration" x WHERE x."claimId"=c."id")) AND tstzrange(c."startAt",c."endAt",'[)')&&tstzrange(NEW."startAt",NEW."endAt",'[)')) THEN RAISE EXCEPTION 'Claim overlaps active supply claim' USING ERRCODE='23P01', CONSTRAINT='SupplyCapacityClaim_no_teleporter_overlap'; END IF;
  IF EXISTS(SELECT 1 FROM "ScheduledJourneyReservation" r WHERE r."teleporterId"=listing."teleporterId" AND r."status"='CONFIRMED' AND tstzrange(r."startAt",r."endAt",'[)')&&tstzrange(NEW."startAt",NEW."endAt",'[)')) THEN RAISE EXCEPTION 'Claim overlaps committed Journey' USING ERRCODE='23P01', CONSTRAINT='SupplyCapacityClaim_committed_overlap'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
