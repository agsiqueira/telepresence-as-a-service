-- Split polymorphic trigger logic so PostgreSQL never resolves fields from another supply table.
CREATE FUNCTION "protect_live_moment_authority"() RETURNS trigger AS $$
DECLARE listing_status "SupplyStatus";
BEGIN
  SELECT "status" INTO listing_status FROM "SupplyListing" WHERE "id"=OLD."listingId" FOR KEY SHARE;
  IF NEW."listingId" IS DISTINCT FROM OLD."listingId" OR listing_status<>'DRAFT' AND (NEW."availabilityStart" IS DISTINCT FROM OLD."availabilityStart" OR NEW."availabilityEnd" IS DISTINCT FROM OLD."availabilityEnd" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt") THEN
    RAISE EXCEPTION 'Live Moment authority is immutable' USING ERRCODE='23514', CONSTRAINT='LiveMoment_authority_immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE FUNCTION "protect_guided_experience_authority"() RETURNS trigger AS $$ BEGIN IF NEW."listingId" IS DISTINCT FROM OLD."listingId" THEN RAISE EXCEPTION 'Guided Experience authority is immutable' USING ERRCODE='23514', CONSTRAINT='GuidedExperience_authority_immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE FUNCTION "protect_guided_occurrence_authority"() RETURNS trigger AS $$ BEGIN IF NEW."guidedExperienceId" IS DISTINCT FROM OLD."guidedExperienceId" OR OLD."status"<>'DRAFT' AND (NEW."availabilityStart" IS DISTINCT FROM OLD."availabilityStart" OR NEW."availabilityEnd" IS DISTINCT FROM OLD."availabilityEnd" OR NEW."capacity" IS DISTINCT FROM OLD."capacity") THEN RAISE EXCEPTION 'Occurrence authority is immutable' USING ERRCODE='23514', CONSTRAINT='GuidedExperienceOccurrence_authority_immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER "LiveMoment_protect_authority" ON "LiveMoment";
DROP TRIGGER "GuidedExperience_protect_authority" ON "GuidedExperience";
DROP TRIGGER "GuidedExperienceOccurrence_protect_authority" ON "GuidedExperienceOccurrence";
CREATE TRIGGER "LiveMoment_protect_authority" BEFORE UPDATE ON "LiveMoment" FOR EACH ROW EXECUTE FUNCTION "protect_live_moment_authority"();
CREATE TRIGGER "GuidedExperience_protect_authority" BEFORE UPDATE ON "GuidedExperience" FOR EACH ROW EXECUTE FUNCTION "protect_guided_experience_authority"();
CREATE TRIGGER "GuidedExperienceOccurrence_protect_authority" BEFORE UPDATE ON "GuidedExperienceOccurrence" FOR EACH ROW EXECUTE FUNCTION "protect_guided_occurrence_authority"();
