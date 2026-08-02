-- Phase 6A permits editing Live Moment availability only while its listing is DRAFT.
-- Published and historical authority remains immutable; no existing row is rewritten.
CREATE OR REPLACE FUNCTION "protect_supply_extension_authority"() RETURNS trigger AS $$
DECLARE listing_status "SupplyStatus";
BEGIN
  IF TG_TABLE_NAME='LiveMoment' THEN
    SELECT "status" INTO listing_status FROM "SupplyListing" WHERE "id"=OLD."listingId" FOR KEY SHARE;
    IF NEW."listingId" IS DISTINCT FROM OLD."listingId" OR (listing_status<>'DRAFT' AND (NEW."availabilityStart",NEW."availabilityEnd",NEW."expiresAt") IS DISTINCT FROM (OLD."availabilityStart",OLD."availabilityEnd",OLD."expiresAt")) THEN
      RAISE EXCEPTION 'Live Moment authority is immutable' USING ERRCODE='23514', CONSTRAINT='LiveMoment_authority_immutable';
    END IF;
  END IF;
  IF TG_TABLE_NAME='GuidedExperience' AND NEW."listingId" IS DISTINCT FROM OLD."listingId" THEN RAISE EXCEPTION 'Guided Experience authority is immutable' USING ERRCODE='23514', CONSTRAINT='GuidedExperience_authority_immutable'; END IF;
  IF TG_TABLE_NAME='GuidedExperienceOccurrence' AND (NEW."guidedExperienceId" IS DISTINCT FROM OLD."guidedExperienceId" OR (OLD."status"<>'DRAFT' AND (NEW."availabilityStart",NEW."availabilityEnd",NEW."capacity") IS DISTINCT FROM (OLD."availabilityStart",OLD."availabilityEnd",OLD."capacity"))) THEN
    RAISE EXCEPTION 'Occurrence authority is immutable' USING ERRCODE='23514', CONSTRAINT='GuidedExperienceOccurrence_authority_immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
