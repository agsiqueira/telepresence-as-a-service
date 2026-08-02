-- Phase 6 shared Teleporter supply foundation. This migration is prospective:
-- it creates no supply for historical Journeys and rewrites no existing row.
CREATE TYPE "SupplyType" AS ENUM ('LIVE_MOMENT', 'GUIDED_EXPERIENCE');
CREATE TYPE "SupplyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');
CREATE TYPE "SupplyCapacityClaimStatus" AS ENUM ('HELD', 'COMMITTED', 'RELEASED', 'EXPIRED');

CREATE TABLE "SupplyListing" (
  "id" UUID NOT NULL, "teleporterId" TEXT NOT NULL, "type" "SupplyType" NOT NULL,
  "status" "SupplyStatus" NOT NULL DEFAULT 'DRAFT', "publicPlaceName" VARCHAR(120) NOT NULL,
  "coarseLocation" VARCHAR(120) NOT NULL, "durationMinutes" INTEGER NOT NULL,
  "priceMinor" INTEGER NOT NULL, "currency" CHAR(3) NOT NULL, "capacity" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ(3), "pausedAt" TIMESTAMPTZ(3), "archivedAt" TIMESTAMPTZ(3),
  CONSTRAINT "SupplyListing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplyListing_terms_check" CHECK ("durationMinutes" > 0 AND "priceMinor" > 0 AND "capacity" > 0 AND "version" > 0 AND "currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "SupplyListing_location_check" CHECK (length(btrim("publicPlaceName")) BETWEEN 1 AND 120 AND length(btrim("coarseLocation")) BETWEEN 1 AND 120),
  CONSTRAINT "SupplyListing_state_timestamps_check" CHECK (
    ("status"='DRAFT' AND "publishedAt" IS NULL AND "pausedAt" IS NULL AND "archivedAt" IS NULL) OR
    ("status"='PUBLISHED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL) OR
    ("status"='PAUSED' AND "publishedAt" IS NOT NULL AND "pausedAt" IS NOT NULL AND "archivedAt" IS NULL) OR
    ("status"='ARCHIVED' AND "archivedAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "SupplyListing_id_teleporterId_key" ON "SupplyListing"("id","teleporterId");
CREATE INDEX "SupplyListing_teleporterId_status_createdAt_idx" ON "SupplyListing"("teleporterId","status","createdAt");
CREATE INDEX "SupplyListing_type_status_publishedAt_idx" ON "SupplyListing"("type","status","publishedAt");
ALTER TABLE "SupplyListing" ADD CONSTRAINT "SupplyListing_teleporterId_fkey" FOREIGN KEY ("teleporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LiveMoment" (
  "id" UUID NOT NULL, "listingId" UUID NOT NULL, "availabilityStart" TIMESTAMPTZ(3) NOT NULL,
  "availabilityEnd" TIMESTAMPTZ(3) NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "LiveMoment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LiveMoment_window_check" CHECK ("availabilityStart" < "availabilityEnd" AND "expiresAt" <= "availabilityEnd")
);
CREATE UNIQUE INDEX "LiveMoment_listingId_key" ON "LiveMoment"("listingId");
CREATE INDEX "LiveMoment_availabilityStart_availabilityEnd_idx" ON "LiveMoment"("availabilityStart","availabilityEnd");
CREATE INDEX "LiveMoment_expiresAt_idx" ON "LiveMoment"("expiresAt");
ALTER TABLE "LiveMoment" ADD CONSTRAINT "LiveMoment_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "SupplyListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GuidedExperience" (
  "id" UUID NOT NULL, "listingId" UUID NOT NULL,
  CONSTRAINT "GuidedExperience_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuidedExperience_listingId_key" ON "GuidedExperience"("listingId");
ALTER TABLE "GuidedExperience" ADD CONSTRAINT "GuidedExperience_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "SupplyListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GuidedExperienceOccurrence" (
  "id" UUID NOT NULL, "guidedExperienceId" UUID NOT NULL, "status" "SupplyStatus" NOT NULL DEFAULT 'DRAFT',
  "availabilityStart" TIMESTAMPTZ(3) NOT NULL, "availabilityEnd" TIMESTAMPTZ(3) NOT NULL,
  "capacity" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ(3), "pausedAt" TIMESTAMPTZ(3), "archivedAt" TIMESTAMPTZ(3),
  CONSTRAINT "GuidedExperienceOccurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuidedExperienceOccurrence_window_check" CHECK ("availabilityStart" < "availabilityEnd" AND "capacity" > 0),
  CONSTRAINT "GuidedExperienceOccurrence_state_check" CHECK (
    ("status"='DRAFT' AND "publishedAt" IS NULL AND "pausedAt" IS NULL AND "archivedAt" IS NULL) OR
    ("status"='PUBLISHED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL) OR
    ("status"='PAUSED' AND "publishedAt" IS NOT NULL AND "pausedAt" IS NOT NULL AND "archivedAt" IS NULL) OR
    ("status"='ARCHIVED' AND "archivedAt" IS NOT NULL)
  )
);
CREATE INDEX "GuidedExperienceOccurrence_guidedExperienceId_status_availabilityStart_idx" ON "GuidedExperienceOccurrence"("guidedExperienceId","status","availabilityStart");
CREATE INDEX "GuidedExperienceOccurrence_status_availabilityStart_availabilityEnd_idx" ON "GuidedExperienceOccurrence"("status","availabilityStart","availabilityEnd");
ALTER TABLE "GuidedExperienceOccurrence" ADD CONSTRAINT "GuidedExperienceOccurrence_guidedExperienceId_fkey" FOREIGN KEY ("guidedExperienceId") REFERENCES "GuidedExperience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SupplyCapacityClaim" (
  "id" UUID NOT NULL, "listingId" UUID NOT NULL, "liveMomentId" UUID, "occurrenceId" UUID,
  "explorerId" TEXT NOT NULL, "teleporterId" TEXT NOT NULL, "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL, "status" "SupplyCapacityClaimStatus" NOT NULL DEFAULT 'HELD',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "releasedAt" TIMESTAMPTZ(3), "committedAt" TIMESTAMPTZ(3), "journeyRequestId" TEXT,
  "proposalId" TEXT, "agreementId" TEXT, "tripId" TEXT,
  CONSTRAINT "SupplyCapacityClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplyCapacityClaim_one_target_check" CHECK (("liveMomentId" IS NOT NULL)::int + ("occurrenceId" IS NOT NULL)::int = 1),
  CONSTRAINT "SupplyCapacityClaim_interval_check" CHECK ("startAt" < "endAt"),
  CONSTRAINT "SupplyCapacityClaim_participants_check" CHECK ("explorerId" <> "teleporterId"),
  CONSTRAINT "SupplyCapacityClaim_state_check" CHECK (
    ("status"='HELD' AND "releasedAt" IS NULL AND "committedAt" IS NULL) OR
    ("status"='COMMITTED' AND "committedAt" IS NOT NULL AND "releasedAt" IS NULL) OR
    ("status" IN ('RELEASED','EXPIRED') AND "releasedAt" IS NOT NULL AND "committedAt" IS NULL)
  ),
  CONSTRAINT "SupplyCapacityClaim_downstream_check" CHECK (
    "status" <> 'COMMITTED' OR ("journeyRequestId" IS NOT NULL AND "proposalId" IS NOT NULL AND "agreementId" IS NOT NULL AND "tripId" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "SupplyCapacityClaim_journeyRequestId_key" ON "SupplyCapacityClaim"("journeyRequestId");
CREATE UNIQUE INDEX "SupplyCapacityClaim_proposalId_key" ON "SupplyCapacityClaim"("proposalId");
CREATE UNIQUE INDEX "SupplyCapacityClaim_agreementId_key" ON "SupplyCapacityClaim"("agreementId");
CREATE UNIQUE INDEX "SupplyCapacityClaim_tripId_key" ON "SupplyCapacityClaim"("tripId");
CREATE UNIQUE INDEX "SupplyCapacityClaim_explorer_live_active_key" ON "SupplyCapacityClaim"("explorerId","liveMomentId") WHERE "status"='HELD';
CREATE UNIQUE INDEX "SupplyCapacityClaim_explorer_occurrence_active_key" ON "SupplyCapacityClaim"("explorerId","occurrenceId") WHERE "status"='HELD';
CREATE INDEX "SupplyCapacityClaim_explorerId_status_expiresAt_idx" ON "SupplyCapacityClaim"("explorerId","status","expiresAt");
CREATE INDEX "SupplyCapacityClaim_teleporterId_status_startAt_endAt_idx" ON "SupplyCapacityClaim"("teleporterId","status","startAt","endAt");
CREATE INDEX "SupplyCapacityClaim_listingId_status_expiresAt_idx" ON "SupplyCapacityClaim"("listingId","status","expiresAt");
CREATE INDEX "SupplyCapacityClaim_liveMomentId_status_expiresAt_idx" ON "SupplyCapacityClaim"("liveMomentId","status","expiresAt");
CREATE INDEX "SupplyCapacityClaim_occurrenceId_status_expiresAt_idx" ON "SupplyCapacityClaim"("occurrenceId","status","expiresAt");
ALTER TABLE "SupplyCapacityClaim" ADD CONSTRAINT "SupplyCapacityClaim_listing_owner_fkey" FOREIGN KEY ("listingId","teleporterId") REFERENCES "SupplyListing"("id","teleporterId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "SupplyCapacityClaim" ADD CONSTRAINT "SupplyCapacityClaim_liveMomentId_fkey" FOREIGN KEY ("liveMomentId") REFERENCES "LiveMoment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyCapacityClaim" ADD CONSTRAINT "SupplyCapacityClaim_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "GuidedExperienceOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyCapacityClaim" ADD CONSTRAINT "SupplyCapacityClaim_explorerId_fkey" FOREIGN KEY ("explorerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyCapacityClaim" ADD CONSTRAINT "SupplyCapacityClaim_journeyRequestId_fkey" FOREIGN KEY ("journeyRequestId") REFERENCES "JourneyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyCapacityClaim" ADD CONSTRAINT "SupplyCapacityClaim_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyCapacityClaim" ADD CONSTRAINT "SupplyCapacityClaim_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyCapacityClaim" ADD CONSTRAINT "SupplyCapacityClaim_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JourneyRequest" ADD COLUMN "supplyListingId" UUID, ADD COLUMN "supplyListingVersion" INTEGER, ADD COLUMN "supplyOccurrenceId" UUID;
ALTER TABLE "Proposal" ADD COLUMN "supplyListingId" UUID, ADD COLUMN "supplyListingVersion" INTEGER, ADD COLUMN "supplyOccurrenceId" UUID;
CREATE INDEX "JourneyRequest_supplyListingId_supplyListingVersion_idx" ON "JourneyRequest"("supplyListingId","supplyListingVersion");
CREATE INDEX "JourneyRequest_supplyOccurrenceId_idx" ON "JourneyRequest"("supplyOccurrenceId");
CREATE INDEX "Proposal_supplyListingId_supplyListingVersion_idx" ON "Proposal"("supplyListingId","supplyListingVersion");
CREATE INDEX "Proposal_supplyOccurrenceId_idx" ON "Proposal"("supplyOccurrenceId");
ALTER TABLE "JourneyRequest" ADD CONSTRAINT "JourneyRequest_supplyListingId_fkey" FOREIGN KEY ("supplyListingId") REFERENCES "SupplyListing"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "JourneyRequest" ADD CONSTRAINT "JourneyRequest_supplyOccurrenceId_fkey" FOREIGN KEY ("supplyOccurrenceId") REFERENCES "GuidedExperienceOccurrence"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_supplyListingId_fkey" FOREIGN KEY ("supplyListingId") REFERENCES "SupplyListing"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_supplyOccurrenceId_fkey" FOREIGN KEY ("supplyOccurrenceId") REFERENCES "GuidedExperienceOccurrence"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "JourneyRequest" ADD CONSTRAINT "JourneyRequest_supply_source_shape_check" CHECK (("supplyListingId" IS NULL AND "supplyListingVersion" IS NULL AND "supplyOccurrenceId" IS NULL) OR ("supplyListingId" IS NOT NULL AND "supplyListingVersion" > 0));
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_supply_source_shape_check" CHECK (("supplyListingId" IS NULL AND "supplyListingVersion" IS NULL AND "supplyOccurrenceId" IS NULL) OR ("supplyListingId" IS NOT NULL AND "supplyListingVersion" > 0));

CREATE FUNCTION "protect_supply_source_attribution"() RETURNS trigger AS $$
BEGIN
  IF (NEW."supplyListingId",NEW."supplyListingVersion",NEW."supplyOccurrenceId") IS DISTINCT FROM (OLD."supplyListingId",OLD."supplyListingVersion",OLD."supplyOccurrenceId") THEN RAISE EXCEPTION 'Supply source attribution is immutable' USING ERRCODE='23514', CONSTRAINT='Supply_source_attribution_immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "JourneyRequest_protect_supply_source" BEFORE UPDATE ON "JourneyRequest" FOR EACH ROW EXECUTE FUNCTION "protect_supply_source_attribution"();
CREATE TRIGGER "Proposal_protect_supply_source" BEFORE UPDATE ON "Proposal" FOR EACH ROW EXECUTE FUNCTION "protect_supply_source_attribution"();

ALTER TABLE "SupplyCapacityClaim" ADD CONSTRAINT "SupplyCapacityClaim_no_teleporter_overlap"
  EXCLUDE USING gist ("teleporterId" WITH =, tstzrange("startAt","endAt",'[)') WITH &&)
  WHERE ("status" IN ('HELD','COMMITTED'));

CREATE FUNCTION "validate_supply_mode_extension"() RETURNS trigger AS $$
DECLARE actual "SupplyType";
BEGIN
  SELECT "type" INTO actual FROM "SupplyListing" WHERE "id"=NEW."listingId" FOR KEY SHARE;
  IF NOT FOUND OR (TG_TABLE_NAME='LiveMoment' AND actual<>'LIVE_MOMENT') OR (TG_TABLE_NAME='GuidedExperience' AND actual<>'GUIDED_EXPERIENCE') THEN
    RAISE EXCEPTION 'Supply extension type mismatch' USING ERRCODE='23514', CONSTRAINT='Supply_mode_extension_check';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "LiveMoment_validate_type" BEFORE INSERT OR UPDATE ON "LiveMoment" FOR EACH ROW EXECUTE FUNCTION "validate_supply_mode_extension"();
CREATE TRIGGER "GuidedExperience_validate_type" BEFORE INSERT OR UPDATE ON "GuidedExperience" FOR EACH ROW EXECUTE FUNCTION "validate_supply_mode_extension"();

CREATE FUNCTION "protect_supply_authority"() RETURNS trigger AS $$
BEGIN
  IF NEW."teleporterId" IS DISTINCT FROM OLD."teleporterId" OR NEW."type" IS DISTINCT FROM OLD."type" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Supply authority is immutable' USING ERRCODE='23514', CONSTRAINT='SupplyListing_authority_immutable';
  END IF;
  IF OLD."status"<>'DRAFT' AND (NEW."durationMinutes",NEW."priceMinor",NEW."currency",NEW."capacity",NEW."publicPlaceName",NEW."coarseLocation") IS DISTINCT FROM (OLD."durationMinutes",OLD."priceMinor",OLD."currency",OLD."capacity",OLD."publicPlaceName",OLD."coarseLocation") THEN
    RAISE EXCEPTION 'Published supply terms are immutable' USING ERRCODE='23514', CONSTRAINT='SupplyListing_published_terms_immutable';
  END IF;
  IF OLD."status"='ARCHIVED' OR (OLD."status"='DRAFT' AND NEW."status" NOT IN ('DRAFT','PUBLISHED','ARCHIVED')) OR (OLD."status"='PUBLISHED' AND NEW."status" NOT IN ('PUBLISHED','PAUSED','ARCHIVED')) OR (OLD."status"='PAUSED' AND NEW."status" NOT IN ('PAUSED','PUBLISHED','ARCHIVED')) THEN
    RAISE EXCEPTION 'Invalid supply lifecycle transition' USING ERRCODE='23514', CONSTRAINT='SupplyListing_transition_check';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "SupplyListing_protect_authority" BEFORE UPDATE ON "SupplyListing" FOR EACH ROW EXECUTE FUNCTION "protect_supply_authority"();
CREATE FUNCTION "prevent_supply_delete"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Supply history cannot be deleted' USING ERRCODE='23514', CONSTRAINT='Supply_history_prevent_delete'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "SupplyListing_prevent_delete" BEFORE DELETE ON "SupplyListing" FOR EACH ROW EXECUTE FUNCTION "prevent_supply_delete"();

CREATE FUNCTION "protect_supply_extension_authority"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME='LiveMoment' AND (NEW."listingId",NEW."availabilityStart",NEW."availabilityEnd",NEW."expiresAt") IS DISTINCT FROM (OLD."listingId",OLD."availabilityStart",OLD."availabilityEnd",OLD."expiresAt") THEN
    RAISE EXCEPTION 'Live Moment authority is immutable' USING ERRCODE='23514', CONSTRAINT='LiveMoment_authority_immutable';
  END IF;
  IF TG_TABLE_NAME='GuidedExperience' AND NEW."listingId" IS DISTINCT FROM OLD."listingId" THEN RAISE EXCEPTION 'Guided Experience authority is immutable' USING ERRCODE='23514', CONSTRAINT='GuidedExperience_authority_immutable'; END IF;
  IF TG_TABLE_NAME='GuidedExperienceOccurrence' AND (NEW."guidedExperienceId" IS DISTINCT FROM OLD."guidedExperienceId" OR (OLD."status"<>'DRAFT' AND (NEW."availabilityStart",NEW."availabilityEnd",NEW."capacity") IS DISTINCT FROM (OLD."availabilityStart",OLD."availabilityEnd",OLD."capacity"))) THEN
    RAISE EXCEPTION 'Occurrence authority is immutable' USING ERRCODE='23514', CONSTRAINT='GuidedExperienceOccurrence_authority_immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "LiveMoment_protect_authority" BEFORE UPDATE ON "LiveMoment" FOR EACH ROW EXECUTE FUNCTION "protect_supply_extension_authority"();
CREATE TRIGGER "GuidedExperience_protect_authority" BEFORE UPDATE ON "GuidedExperience" FOR EACH ROW EXECUTE FUNCTION "protect_supply_extension_authority"();
CREATE TRIGGER "GuidedExperienceOccurrence_protect_authority" BEFORE UPDATE ON "GuidedExperienceOccurrence" FOR EACH ROW EXECUTE FUNCTION "protect_supply_extension_authority"();

CREATE FUNCTION "validate_supply_claim_insert"() RETURNS trigger AS $$
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
  SELECT count(*) INTO active_count FROM "SupplyCapacityClaim" WHERE "status" IN ('HELD','COMMITTED') AND ((NEW."liveMomentId" IS NOT NULL AND "liveMomentId"=NEW."liveMomentId") OR (NEW."occurrenceId" IS NOT NULL AND "occurrenceId"=NEW."occurrenceId")); IF active_count>=target_capacity THEN RAISE EXCEPTION 'Supply capacity exhausted' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_capacity_check'; END IF;
  IF EXISTS(SELECT 1 FROM "ScheduledJourneyReservation" r WHERE r."teleporterId"=listing."teleporterId" AND r."status"='CONFIRMED' AND tstzrange(r."startAt",r."endAt",'[)')&&tstzrange(NEW."startAt",NEW."endAt",'[)')) THEN RAISE EXCEPTION 'Claim overlaps committed Journey' USING ERRCODE='23P01', CONSTRAINT='SupplyCapacityClaim_committed_overlap'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "SupplyCapacityClaim_validate_insert" BEFORE INSERT ON "SupplyCapacityClaim" FOR EACH ROW EXECUTE FUNCTION "validate_supply_claim_insert"();

CREATE FUNCTION "protect_supply_claim_mutation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Supply claims are append-only' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_prevent_delete'; END IF;
  IF (NEW."listingId",NEW."liveMomentId",NEW."occurrenceId",NEW."explorerId",NEW."teleporterId",NEW."startAt",NEW."endAt",NEW."createdAt",NEW."expiresAt") IS DISTINCT FROM (OLD."listingId",OLD."liveMomentId",OLD."occurrenceId",OLD."explorerId",OLD."teleporterId",OLD."startAt",OLD."endAt",OLD."createdAt",OLD."expiresAt") OR OLD."status"<>'HELD' OR NEW."status" NOT IN ('COMMITTED','RELEASED','EXPIRED') THEN RAISE EXCEPTION 'Supply claim authority is immutable' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_immutable'; END IF;
  IF NEW."status"='COMMITTED' AND (NEW."releasedAt" IS NOT NULL OR NEW."committedAt" IS NULL OR NEW."journeyRequestId" IS NULL OR NEW."proposalId" IS NULL OR NEW."agreementId" IS NULL OR NEW."tripId" IS NULL) THEN RAISE EXCEPTION 'Committed claim requires downstream authority' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_commit_authority_check'; END IF;
  IF NEW."status" IN ('RELEASED','EXPIRED') AND (NEW."releasedAt" IS NULL OR NEW."committedAt" IS NOT NULL OR (NEW."journeyRequestId",NEW."proposalId",NEW."agreementId",NEW."tripId") IS DISTINCT FROM (OLD."journeyRequestId",OLD."proposalId",OLD."agreementId",OLD."tripId")) THEN RAISE EXCEPTION 'Released claim cannot gain downstream authority' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_release_authority_check'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "SupplyCapacityClaim_protect_update" BEFORE UPDATE ON "SupplyCapacityClaim" FOR EACH ROW EXECUTE FUNCTION "protect_supply_claim_mutation"();
CREATE TRIGGER "SupplyCapacityClaim_prevent_delete" BEFORE DELETE ON "SupplyCapacityClaim" FOR EACH ROW EXECUTE FUNCTION "protect_supply_claim_mutation"();
