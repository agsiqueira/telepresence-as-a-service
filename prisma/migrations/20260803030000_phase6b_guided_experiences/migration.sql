ALTER TABLE "GuidedExperience"
  ADD COLUMN "title" VARCHAR(120) NOT NULL,
  ADD COLUMN "description" VARCHAR(2000) NOT NULL,
  ADD CONSTRAINT "GuidedExperience_description_check" CHECK (length(btrim("title")) BETWEEN 3 AND 120 AND length(btrim("description")) BETWEEN 20 AND 2000);

ALTER TABLE "GuidedExperienceOccurrence"
  ADD COLUMN "supplyListingVersion" INTEGER,
  ADD COLUMN "titleSnapshot" VARCHAR(120),
  ADD COLUMN "descriptionSnapshot" VARCHAR(2000),
  ADD COLUMN "publicPlaceSnapshot" VARCHAR(120),
  ADD COLUMN "coarseLocationSnapshot" VARCHAR(120),
  ADD COLUMN "durationMinutesSnapshot" INTEGER,
  ADD COLUMN "priceMinorSnapshot" INTEGER,
  ADD COLUMN "currencySnapshot" CHAR(3),
  ADD COLUMN "replacesOccurrenceId" UUID,
  ADD CONSTRAINT "GuidedExperienceOccurrence_capacity_one_check" CHECK ("capacity"=1),
  ADD CONSTRAINT "GuidedExperienceOccurrence_snapshot_shape_check" CHECK (
    ("status"='DRAFT' AND "supplyListingVersion" IS NULL AND "titleSnapshot" IS NULL AND "descriptionSnapshot" IS NULL AND "publicPlaceSnapshot" IS NULL AND "coarseLocationSnapshot" IS NULL AND "durationMinutesSnapshot" IS NULL AND "priceMinorSnapshot" IS NULL AND "currencySnapshot" IS NULL) OR
    ("status" IN ('PUBLISHED','ARCHIVED') AND "supplyListingVersion">0 AND length(btrim("titleSnapshot")) BETWEEN 3 AND 120 AND length(btrim("descriptionSnapshot")) BETWEEN 20 AND 2000 AND length(btrim("publicPlaceSnapshot")) BETWEEN 1 AND 120 AND length(btrim("coarseLocationSnapshot")) BETWEEN 1 AND 120 AND "durationMinutesSnapshot">0 AND "priceMinorSnapshot">0 AND "currencySnapshot" ~ '^[A-Z]{3}$')
  );

CREATE UNIQUE INDEX "GuidedExperienceOccurrence_guidedExperienceId_availabilityStart_key" ON "GuidedExperienceOccurrence"("guidedExperienceId","availabilityStart");
CREATE UNIQUE INDEX "GuidedExperienceOccurrence_replacesOccurrenceId_key" ON "GuidedExperienceOccurrence"("replacesOccurrenceId");
ALTER TABLE "GuidedExperienceOccurrence" ADD CONSTRAINT "GuidedExperienceOccurrence_replacesOccurrenceId_fkey" FOREIGN KEY ("replacesOccurrenceId") REFERENCES "GuidedExperienceOccurrence"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "protect_guided_experience_terms"() RETURNS trigger AS $$
DECLARE listing_status "SupplyStatus";
BEGIN
  SELECT "status" INTO listing_status FROM "SupplyListing" WHERE "id"=OLD."listingId" FOR KEY SHARE;
  IF NEW."listingId" IS DISTINCT FROM OLD."listingId" OR (listing_status NOT IN ('DRAFT','PAUSED') AND (NEW."title",NEW."description") IS DISTINCT FROM (OLD."title",OLD."description")) THEN
    RAISE EXCEPTION 'Published Guided Experience terms are immutable' USING ERRCODE='23514', CONSTRAINT='GuidedExperience_terms_immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "GuidedExperience_protect_terms" BEFORE UPDATE ON "GuidedExperience" FOR EACH ROW EXECUTE FUNCTION "protect_guided_experience_terms"();

CREATE OR REPLACE FUNCTION "protect_guided_occurrence_authority"() RETURNS trigger AS $$
DECLARE parent "SupplyListing"%ROWTYPE; guide "GuidedExperience"%ROWTYPE;
BEGIN
  SELECT l.* INTO parent FROM "SupplyListing" l JOIN "GuidedExperience" g ON g."listingId"=l."id" WHERE g."id"=OLD."guidedExperienceId" FOR KEY SHARE OF l;
  SELECT * INTO guide FROM "GuidedExperience" WHERE "id"=OLD."guidedExperienceId" FOR KEY SHARE;
  IF NEW."guidedExperienceId" IS DISTINCT FROM OLD."guidedExperienceId" OR OLD."status"='ARCHIVED' OR NEW."status"='PAUSED' OR
     (OLD."status"='DRAFT' AND NEW."status" NOT IN ('DRAFT','PUBLISHED')) OR (OLD."status"='PUBLISHED' AND NEW."status" NOT IN ('PUBLISHED','ARCHIVED')) THEN
    RAISE EXCEPTION 'Invalid occurrence lifecycle transition' USING ERRCODE='23514', CONSTRAINT='GuidedExperienceOccurrence_transition_check';
  END IF;
  IF OLD."status"<>'DRAFT' AND (NEW."availabilityStart",NEW."availabilityEnd",NEW."capacity",NEW."supplyListingVersion",NEW."titleSnapshot",NEW."descriptionSnapshot",NEW."publicPlaceSnapshot",NEW."coarseLocationSnapshot",NEW."durationMinutesSnapshot",NEW."priceMinorSnapshot",NEW."currencySnapshot",NEW."replacesOccurrenceId") IS DISTINCT FROM (OLD."availabilityStart",OLD."availabilityEnd",OLD."capacity",OLD."supplyListingVersion",OLD."titleSnapshot",OLD."descriptionSnapshot",OLD."publicPlaceSnapshot",OLD."coarseLocationSnapshot",OLD."durationMinutesSnapshot",OLD."priceMinorSnapshot",OLD."currencySnapshot",OLD."replacesOccurrenceId") THEN
    RAISE EXCEPTION 'Published occurrence authority is immutable' USING ERRCODE='23514', CONSTRAINT='GuidedExperienceOccurrence_authority_immutable';
  END IF;
  IF OLD."status"='DRAFT' AND (OLD."publishedAt" IS NOT NULL OR OLD."availabilityStart"<=CURRENT_TIMESTAMP OR EXISTS(SELECT 1 FROM "SupplyCapacityClaim" c WHERE c."occurrenceId"=OLD."id")) THEN
    RAISE EXCEPTION 'Protected occurrence cannot be edited' USING ERRCODE='23514', CONSTRAINT='GuidedExperienceOccurrence_draft_protection';
  END IF;
  IF OLD."status"='DRAFT' AND NEW."status"='PUBLISHED' THEN
    IF parent."status"<>'PUBLISHED' OR NEW."availabilityStart"<=CURRENT_TIMESTAMP OR NEW."capacity"<>1 OR NEW."availabilityEnd"<>NEW."availabilityStart"+parent."durationMinutes"*interval '1 minute' OR
       (NEW."supplyListingVersion",NEW."titleSnapshot",NEW."descriptionSnapshot",NEW."publicPlaceSnapshot",NEW."coarseLocationSnapshot",NEW."durationMinutesSnapshot",NEW."priceMinorSnapshot",NEW."currencySnapshot") IS DISTINCT FROM (parent."version",guide."title",guide."description",parent."publicPlaceName",parent."coarseLocation",parent."durationMinutes",parent."priceMinor",parent."currency") THEN
      RAISE EXCEPTION 'Occurrence publication authority invalid' USING ERRCODE='23514', CONSTRAINT='GuidedExperienceOccurrence_publish_check';
    END IF;
    NEW."publishedAt":=CURRENT_TIMESTAMP; NEW."pausedAt":=NULL; NEW."archivedAt":=NULL;
  END IF;
  IF OLD."status"='PUBLISHED' AND NEW."status"='ARCHIVED' THEN
    IF OLD."availabilityStart"<=CURRENT_TIMESTAMP OR EXISTS(SELECT 1 FROM "SupplyCapacityClaim" c WHERE c."occurrenceId"=OLD."id" AND (c."status"='HELD' AND c."expiresAt">CURRENT_TIMESTAMP OR c."status"='COMMITTED' AND NOT EXISTS(SELECT 1 FROM "SupplyCapacityRestoration" r WHERE r."claimId"=c."id"))) OR EXISTS(SELECT 1 FROM "SupplyCapacityClaim" c JOIN "ScheduledJourneyReservation" r ON r."tripId"=c."tripId" WHERE c."occurrenceId"=OLD."id" AND r."status"='CONFIRMED') THEN
      RAISE EXCEPTION 'Protected occurrence cannot be archived' USING ERRCODE='23514', CONSTRAINT='GuidedExperienceOccurrence_archive_protection';
    END IF;
    NEW."archivedAt":=CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE FUNCTION "validate_guided_occurrence_insert"() RETURNS trigger AS $$
DECLARE original "GuidedExperienceOccurrence"%ROWTYPE;
BEGIN
  IF NEW."status"<>'DRAFT' OR NEW."capacity"<>1 OR NEW."availabilityStart"<=CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'New occurrence must be a future capacity-one draft' USING ERRCODE='23514', CONSTRAINT='GuidedExperienceOccurrence_insert_check'; END IF;
  NEW."availabilityEnd":=NEW."availabilityStart"+(SELECT l."durationMinutes"*interval '1 minute' FROM "SupplyListing" l JOIN "GuidedExperience" g ON g."listingId"=l."id" WHERE g."id"=NEW."guidedExperienceId");
  NEW."createdAt":=CURRENT_TIMESTAMP; NEW."publishedAt":=NULL; NEW."pausedAt":=NULL; NEW."archivedAt":=NULL;
  NEW."supplyListingVersion":=NULL; NEW."titleSnapshot":=NULL; NEW."descriptionSnapshot":=NULL; NEW."publicPlaceSnapshot":=NULL; NEW."coarseLocationSnapshot":=NULL; NEW."durationMinutesSnapshot":=NULL; NEW."priceMinorSnapshot":=NULL; NEW."currencySnapshot":=NULL;
  IF NEW."replacesOccurrenceId" IS NOT NULL THEN
    SELECT * INTO original FROM "GuidedExperienceOccurrence" WHERE "id"=NEW."replacesOccurrenceId" FOR UPDATE;
    IF NOT FOUND OR original."guidedExperienceId"<>NEW."guidedExperienceId" OR original."status"<>'ARCHIVED' OR original."replacesOccurrenceId" IS NOT NULL THEN RAISE EXCEPTION 'Invalid occurrence replacement' USING ERRCODE='23514', CONSTRAINT='GuidedExperienceOccurrence_replacement_check'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "GuidedExperienceOccurrence_validate_insert" BEFORE INSERT ON "GuidedExperienceOccurrence" FOR EACH ROW EXECUTE FUNCTION "validate_guided_occurrence_insert"();

CREATE FUNCTION "protect_guided_occurrence_delete"() RETURNS trigger AS $$
BEGIN
  IF OLD."status"<>'DRAFT' OR OLD."publishedAt" IS NOT NULL OR OLD."availabilityStart"<=CURRENT_TIMESTAMP OR EXISTS(SELECT 1 FROM "SupplyCapacityClaim" c WHERE c."occurrenceId"=OLD."id") THEN RAISE EXCEPTION 'Occurrence history cannot be deleted' USING ERRCODE='23514', CONSTRAINT='GuidedExperienceOccurrence_prevent_delete'; END IF;
  RETURN OLD;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "GuidedExperienceOccurrence_protect_delete" BEFORE DELETE ON "GuidedExperienceOccurrence" FOR EACH ROW EXECUTE FUNCTION "protect_guided_occurrence_delete"();

CREATE OR REPLACE FUNCTION "protect_supply_authority"() RETURNS trigger AS $$
BEGIN
  IF NEW."teleporterId" IS DISTINCT FROM OLD."teleporterId" OR NEW."type" IS DISTINCT FROM OLD."type" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN RAISE EXCEPTION 'Supply authority is immutable' USING ERRCODE='23514', CONSTRAINT='SupplyListing_authority_immutable'; END IF;
  IF OLD."status"<>'DRAFT' AND NOT (OLD."type"='GUIDED_EXPERIENCE' AND OLD."status"='PAUSED') AND (NEW."durationMinutes",NEW."priceMinor",NEW."currency",NEW."capacity",NEW."publicPlaceName",NEW."coarseLocation") IS DISTINCT FROM (OLD."durationMinutes",OLD."priceMinor",OLD."currency",OLD."capacity",OLD."publicPlaceName",OLD."coarseLocation") THEN RAISE EXCEPTION 'Published supply terms are immutable' USING ERRCODE='23514', CONSTRAINT='SupplyListing_published_terms_immutable'; END IF;
  IF OLD."status"='ARCHIVED' OR (OLD."status"='DRAFT' AND NEW."status" NOT IN ('DRAFT','PUBLISHED','ARCHIVED')) OR (OLD."status"='PUBLISHED' AND NEW."status" NOT IN ('PUBLISHED','PAUSED','ARCHIVED')) OR (OLD."status"='PAUSED' AND NEW."status" NOT IN ('PAUSED','PUBLISHED','ARCHIVED')) THEN RAISE EXCEPTION 'Invalid supply lifecycle transition' USING ERRCODE='23514', CONSTRAINT='SupplyListing_transition_check'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE FUNCTION "validate_guided_claim_exact"() RETURNS trigger AS $$
DECLARE o "GuidedExperienceOccurrence"%ROWTYPE;
BEGIN
  IF NEW."occurrenceId" IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO o FROM "GuidedExperienceOccurrence" WHERE "id"=NEW."occurrenceId" FOR KEY SHARE;
  IF NOT FOUND OR o."status"<>'PUBLISHED' OR o."availabilityStart"<=CURRENT_TIMESTAMP OR o."capacity"<>1 OR NEW."startAt"<>o."availabilityStart" OR NEW."endAt"<>o."availabilityEnd" OR o."supplyListingVersion" IS NULL THEN RAISE EXCEPTION 'Guided occurrence unavailable' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_guided_exact_check'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "SupplyCapacityClaim_validate_guided_exact" BEFORE INSERT ON "SupplyCapacityClaim" FOR EACH ROW EXECUTE FUNCTION "validate_guided_claim_exact"();

-- Preserve Live Moment window semantics while making an occurrence's published
-- duration snapshot, rather than the mutable parent template, authoritative.
CREATE OR REPLACE FUNCTION "validate_supply_claim_insert"() RETURNS trigger AS $$
DECLARE listing "SupplyListing"%ROWTYPE; window_start timestamptz; window_end timestamptz; target_capacity integer; target_duration integer; active_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('phase6-claim-explorer:'||NEW."explorerId",0));
  SELECT * INTO listing FROM "SupplyListing" WHERE "id"=NEW."listingId" FOR UPDATE;
  IF NOT FOUND OR listing."status"<>'PUBLISHED' THEN RAISE EXCEPTION 'Supply unavailable' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_supply_available_check'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('phase6-claim-teleporter:'||listing."teleporterId",0));
  UPDATE "SupplyCapacityClaim" SET "status"='EXPIRED',"releasedAt"=CURRENT_TIMESTAMP WHERE "status"='HELD' AND "expiresAt"<=CURRENT_TIMESTAMP AND ("explorerId"=NEW."explorerId" OR "teleporterId"=listing."teleporterId");
  NEW."teleporterId":=listing."teleporterId"; NEW."status":='HELD'; NEW."createdAt":=CURRENT_TIMESTAMP; NEW."expiresAt":=CURRENT_TIMESTAMP+interval '10 minutes'; NEW."releasedAt":=NULL; NEW."committedAt":=NULL;
  IF listing."type"='LIVE_MOMENT' AND NEW."liveMomentId" IS NOT NULL AND NEW."occurrenceId" IS NULL THEN
    SELECT "availabilityStart","availabilityEnd",listing."capacity",listing."durationMinutes" INTO window_start,window_end,target_capacity,target_duration FROM "LiveMoment" WHERE "id"=NEW."liveMomentId" AND "listingId"=listing."id" AND "expiresAt">CURRENT_TIMESTAMP FOR KEY SHARE;
  ELSIF listing."type"='GUIDED_EXPERIENCE' AND NEW."occurrenceId" IS NOT NULL AND NEW."liveMomentId" IS NULL THEN
    SELECT o."availabilityStart",o."availabilityEnd",o."capacity",o."durationMinutesSnapshot" INTO window_start,window_end,target_capacity,target_duration FROM "GuidedExperienceOccurrence" o JOIN "GuidedExperience" g ON g."id"=o."guidedExperienceId" WHERE o."id"=NEW."occurrenceId" AND g."listingId"=listing."id" AND o."status"='PUBLISHED' AND o."availabilityStart">CURRENT_TIMESTAMP FOR KEY SHARE OF o;
  ELSE RAISE EXCEPTION 'Supply claim target mismatch' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_target_type_check'; END IF;
  IF window_start IS NULL OR target_duration IS NULL OR NEW."startAt"<window_start OR NEW."endAt">window_end OR NEW."endAt"<>NEW."startAt"+target_duration*interval '1 minute' THEN RAISE EXCEPTION 'Claim interval invalid' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_target_interval_check'; END IF;
  IF EXISTS(SELECT 1 FROM "SupplyCapacityClaim" c WHERE c."explorerId"=NEW."explorerId" AND c."status"='HELD' AND ((NEW."liveMomentId" IS NOT NULL AND c."liveMomentId"=NEW."liveMomentId") OR (NEW."occurrenceId" IS NOT NULL AND c."occurrenceId"=NEW."occurrenceId"))) THEN RAISE EXCEPTION 'Explorer already has target claim' USING ERRCODE='23505', CONSTRAINT='SupplyCapacityClaim_explorer_target_active_key'; END IF;
  SELECT count(*) INTO active_count FROM "SupplyCapacityClaim" WHERE "explorerId"=NEW."explorerId" AND "status"='HELD'; IF active_count>=3 THEN RAISE EXCEPTION 'Explorer active claim limit reached' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_explorer_global_limit'; END IF;
  SELECT count(*) INTO active_count FROM "SupplyCapacityClaim" c WHERE c."status" IN ('HELD','COMMITTED') AND NOT (c."status"='COMMITTED' AND EXISTS(SELECT 1 FROM "SupplyCapacityRestoration" x WHERE x."claimId"=c."id")) AND ((NEW."liveMomentId" IS NOT NULL AND c."liveMomentId"=NEW."liveMomentId") OR (NEW."occurrenceId" IS NOT NULL AND c."occurrenceId"=NEW."occurrenceId")); IF active_count>=target_capacity THEN RAISE EXCEPTION 'Supply capacity exhausted' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityClaim_capacity_check'; END IF;
  IF EXISTS(SELECT 1 FROM "SupplyCapacityClaim" c WHERE c."teleporterId"=listing."teleporterId" AND c."status" IN ('HELD','COMMITTED') AND NOT (c."status"='COMMITTED' AND EXISTS(SELECT 1 FROM "SupplyCapacityRestoration" x WHERE x."claimId"=c."id")) AND tstzrange(c."startAt",c."endAt",'[)')&&tstzrange(NEW."startAt",NEW."endAt",'[)')) THEN RAISE EXCEPTION 'Claim overlaps active supply claim' USING ERRCODE='23P01', CONSTRAINT='SupplyCapacityClaim_no_teleporter_overlap'; END IF;
  IF EXISTS(SELECT 1 FROM "ScheduledJourneyReservation" r WHERE r."teleporterId"=listing."teleporterId" AND r."status"='CONFIRMED' AND tstzrange(r."startAt",r."endAt",'[)')&&tstzrange(NEW."startAt",NEW."endAt",'[)')) THEN RAISE EXCEPTION 'Claim overlaps committed Journey' USING ERRCODE='23P01', CONSTRAINT='SupplyCapacityClaim_committed_overlap'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "validate_supply_capacity_restoration"() RETURNS trigger AS $$
DECLARE c "SupplyCapacityClaim"%ROWTYPE; l "SupplyListing"%ROWTYPE; t "Trip"%ROWTYPE; live_expires timestamptz; occurrence_valid boolean;
BEGIN
  SELECT * INTO l FROM "SupplyListing" WHERE "id"=NEW."listingId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restoration listing missing' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_provenance_check'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('phase6-claim-teleporter:'||l."teleporterId",0));
  SELECT * INTO c FROM "SupplyCapacityClaim" WHERE "id"=NEW."claimId" FOR UPDATE;
  SELECT * INTO t FROM "Trip" WHERE "id"=NEW."tripId" FOR KEY SHARE;
  IF c."status"<>'COMMITTED' OR c."tripId" IS DISTINCT FROM NEW."tripId" OR c."listingId" IS DISTINCT FROM NEW."listingId" OR c."liveMomentId" IS DISTINCT FROM NEW."liveMomentId" OR c."occurrenceId" IS DISTINCT FROM NEW."occurrenceId" OR t."status"<>'CANCELLED' OR t."startedAt" IS NOT NULL OR t."cancelledAt" IS NULL OR t."cancelledAt">=c."startAt" OR EXISTS(SELECT 1 FROM "ScheduledJourneyReservation" r WHERE r."tripId"=t."id" AND r."status"='CONFIRMED') THEN RAISE EXCEPTION 'Restoration provenance invalid' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_provenance_check'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Agreement" a JOIN "JourneyRequest" j ON j."id"=a."journeyRequestId" JOIN "Proposal" p ON p."id"=a."proposalId" WHERE a."id"=c."agreementId" AND a."tripId"=c."tripId" AND c."journeyRequestId"=j."id" AND c."proposalId"=p."id" AND j."tripId"=c."tripId" AND j."supplyListingId"=c."listingId" AND p."supplyListingId"=c."listingId" AND j."supplyOccurrenceId" IS NOT DISTINCT FROM c."occurrenceId" AND p."supplyOccurrenceId" IS NOT DISTINCT FROM c."occurrenceId" AND j."supplyListingVersion"=p."supplyListingVersion" AND j."explorerId"=c."explorerId" AND a."explorerId"=c."explorerId" AND a."teleporterId"=c."teleporterId" AND a."agreedStartAt"=c."startAt" AND a."agreedDurationMinutes"*interval '1 minute'=c."endAt"-c."startAt") THEN RAISE EXCEPTION 'Restoration provenance invalid' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_provenance_check'; END IF;
  IF l."status"<>'PUBLISHED' OR (c."occurrenceId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "User" u JOIN "OperatorProfile" op ON op."userId"=u."id" WHERE u."id"=l."teleporterId" AND u."accountStatus"='ACTIVE' AND u."role"<>'ADMIN' AND op."pilotStatus"='APPROVED' AND NOT EXISTS(SELECT 1 FROM "SafetyReportRestriction" sr WHERE sr."participantId"=u."id" AND sr."status"='ACTIVE' AND sr."startsAt"<=CURRENT_TIMESTAMP AND sr."expiresAt">CURRENT_TIMESTAMP))) THEN RAISE EXCEPTION 'Restoration supply unavailable' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_supply_available_check'; END IF;
  IF c."liveMomentId" IS NOT NULL THEN
    SELECT "expiresAt" INTO live_expires FROM "LiveMoment" WHERE "id"=c."liveMomentId" AND "listingId"=l."id" AND c."startAt">="availabilityStart" AND c."endAt"<="availabilityEnd" AND c."endAt"=c."startAt"+l."durationMinutes"*interval '1 minute';
    IF live_expires IS NULL OR live_expires<=CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Restoration supply expired' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_supply_available_check'; END IF;
  ELSIF c."occurrenceId" IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM "GuidedExperienceOccurrence" o JOIN "GuidedExperience" g ON g."id"=o."guidedExperienceId" JOIN "JourneyRequest" j ON j."id"=c."journeyRequestId" JOIN "Proposal" p ON p."id"=c."proposalId" WHERE o."id"=c."occurrenceId" AND g."listingId"=l."id" AND o."status"='PUBLISHED' AND o."availabilityStart">CURRENT_TIMESTAMP AND o."availabilityStart"=c."startAt" AND o."availabilityEnd"=c."endAt" AND o."durationMinutesSnapshot"*interval '1 minute'=c."endAt"-c."startAt" AND j."supplyListingVersion"=o."supplyListingVersion" AND p."supplyListingVersion"=o."supplyListingVersion" AND j."durationMinutes"=o."durationMinutesSnapshot" AND p."durationMinutes"=o."durationMinutesSnapshot" AND j."proposedPriceMinor"=o."priceMinorSnapshot" AND p."proposedPriceMinor"=o."priceMinorSnapshot" AND j."currency"=o."currencySnapshot" AND p."currency"=o."currencySnapshot" AND j."publicPlaceName"=o."publicPlaceSnapshot" AND j."coarseLocation"=o."coarseLocationSnapshot") INTO occurrence_valid;
    IF NOT occurrence_valid THEN RAISE EXCEPTION 'Restoration occurrence unavailable' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_supply_available_check'; END IF;
  ELSE RAISE EXCEPTION 'Restoration target missing' USING ERRCODE='23514', CONSTRAINT='SupplyCapacityRestoration_provenance_check'; END IF;
  IF EXISTS(SELECT 1 FROM "SupplyCapacityClaim" other WHERE other."id"<>c."id" AND other."teleporterId"=c."teleporterId" AND other."status" IN ('HELD','COMMITTED') AND NOT (other."status"='COMMITTED' AND EXISTS(SELECT 1 FROM "SupplyCapacityRestoration" x WHERE x."claimId"=other."id")) AND tstzrange(other."startAt",other."endAt",'[)')&&tstzrange(c."startAt",c."endAt",'[)')) OR EXISTS(SELECT 1 FROM "ScheduledJourneyReservation" r WHERE r."tripId"<>c."tripId" AND r."teleporterId"=c."teleporterId" AND r."status"='CONFIRMED' AND tstzrange(r."startAt",r."endAt",'[)')&&tstzrange(c."startAt",c."endAt",'[)')) THEN RAISE EXCEPTION 'Restoration interval conflicts' USING ERRCODE='23P01', CONSTRAINT='SupplyCapacityRestoration_conflict_check'; END IF;
  NEW."listingId":=c."listingId"; NEW."liveMomentId":=c."liveMomentId"; NEW."occurrenceId":=c."occurrenceId"; NEW."tripId":=c."tripId"; NEW."startAt":=c."startAt"; NEW."endAt":=c."endAt"; NEW."createdAt":=CURRENT_TIMESTAMP;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
