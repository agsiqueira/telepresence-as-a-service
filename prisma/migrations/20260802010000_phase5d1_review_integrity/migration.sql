-- Phase 5D.1 hardens future Journey Review writes without rewriting historical
-- Trips or reviews. Cross-table attribution requires a trigger because a CHECK
-- constraint cannot safely reference the authoritative Trip row.
CREATE FUNCTION "validate_journey_review_attribution"() RETURNS trigger AS $$
DECLARE journey "Trip"%ROWTYPE;
BEGIN
  SELECT * INTO journey FROM "Trip" WHERE "id" = NEW."tripId" FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'JourneyReview_tripId_fkey', MESSAGE = 'Journey review Journey does not exist';
  END IF;
  IF journey."status" NOT IN ('ENDED', 'FEEDBACK_COMPLETED')
     OR journey."endedAt" IS NULL OR journey."reviewDeadlineAt" IS NULL
     OR journey."operatorId" IS NULL OR journey."viewerId" = journey."operatorId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'JourneyReview_eligible_journey_check', MESSAGE = 'Journey is not eligible for review';
  END IF;
  IF NOT (
    (NEW."reviewerId" = journey."viewerId" AND NEW."revieweeId" = journey."operatorId" AND NEW."reviewerRole" = 'EXPLORER' AND NEW."revieweeRole" = 'TELEPORTER') OR
    (NEW."reviewerId" = journey."operatorId" AND NEW."revieweeId" = journey."viewerId" AND NEW."reviewerRole" = 'TELEPORTER' AND NEW."revieweeRole" = 'EXPLORER')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'JourneyReview_trip_attribution_check', MESSAGE = 'Journey review attribution does not match Journey participation';
  END IF;
  IF CURRENT_TIMESTAMP >= journey."reviewDeadlineAt" OR NEW."submittedAt" >= journey."reviewDeadlineAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'JourneyReview_submission_window_check', MESSAGE = 'Journey review window is closed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JourneyReview_validate_attribution"
BEFORE INSERT ON "JourneyReview"
FOR EACH ROW EXECUTE FUNCTION "validate_journey_review_attribution"();

CREATE FUNCTION "protect_completed_journey_review_authority"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('ENDED', 'FEEDBACK_COMPLETED') THEN
    IF NEW."status" NOT IN ('ENDED', 'FEEDBACK_COMPLETED')
       OR NEW."viewerId" IS DISTINCT FROM OLD."viewerId"
       OR NEW."operatorId" IS DISTINCT FROM OLD."operatorId"
       OR NEW."endedAt" IS DISTINCT FROM OLD."endedAt"
       OR NEW."reviewDeadlineAt" IS DISTINCT FROM OLD."reviewDeadlineAt" THEN
      RAISE EXCEPTION 'Completed Journey review authority is immutable' USING ERRCODE = '23514', CONSTRAINT = 'Trip_completed_review_authority_immutable';
    END IF;
  ELSIF NEW."status" IN ('ENDED', 'FEEDBACK_COMPLETED')
        AND NEW."operatorId" IS NOT NULL AND NEW."viewerId" <> NEW."operatorId" THEN
    IF NEW."endedAt" IS NULL OR NEW."reviewDeadlineAt" IS NULL
       OR NEW."reviewDeadlineAt" IS DISTINCT FROM NEW."endedAt" + interval '14 days' THEN
      RAISE EXCEPTION 'Completed Journey requires the exact review deadline' USING ERRCODE = '23514', CONSTRAINT = 'Trip_review_deadline_derivation_check';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Trip_protect_completed_review_authority"
BEFORE UPDATE ON "Trip"
FOR EACH ROW EXECUTE FUNCTION "protect_completed_journey_review_authority"();
