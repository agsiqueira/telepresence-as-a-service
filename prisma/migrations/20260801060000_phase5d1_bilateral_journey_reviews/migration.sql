-- Phase 5D.1 adds immutable bilateral marketplace reviews. Existing private
-- Feedback and historical Trip rows are intentionally not rewritten.
CREATE TYPE "JourneyReviewRole" AS ENUM ('EXPLORER', 'TELEPORTER');

ALTER TABLE "Trip" ADD COLUMN "reviewDeadlineAt" TIMESTAMPTZ(3);

CREATE TABLE "JourneyReview" (
  "id" UUID NOT NULL,
  "tripId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "revieweeId" TEXT NOT NULL,
  "reviewerRole" "JourneyReviewRole" NOT NULL,
  "revieweeRole" "JourneyReviewRole" NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" VARCHAR(1000),
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JourneyReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JourneyReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "JourneyReview_distinct_participants_check" CHECK ("reviewerId" <> "revieweeId"),
  CONSTRAINT "JourneyReview_opposite_roles_check" CHECK (
    ("reviewerRole" = 'EXPLORER' AND "revieweeRole" = 'TELEPORTER') OR
    ("reviewerRole" = 'TELEPORTER' AND "revieweeRole" = 'EXPLORER')
  ),
  CONSTRAINT "JourneyReview_comment_length_check" CHECK ("comment" IS NULL OR char_length("comment") <= 1000)
);

CREATE UNIQUE INDEX "JourneyReview_tripId_reviewerId_key" ON "JourneyReview"("tripId", "reviewerId");
CREATE UNIQUE INDEX "JourneyReview_tripId_reviewerRole_key" ON "JourneyReview"("tripId", "reviewerRole");
CREATE INDEX "JourneyReview_revieweeId_revieweeRole_submittedAt_idx" ON "JourneyReview"("revieweeId", "revieweeRole", "submittedAt");
CREATE INDEX "JourneyReview_tripId_submittedAt_idx" ON "JourneyReview"("tripId", "submittedAt");

ALTER TABLE "JourneyReview" ADD CONSTRAINT "JourneyReview_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JourneyReview" ADD CONSTRAINT "JourneyReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JourneyReview" ADD CONSTRAINT "JourneyReview_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_journey_review_mutation"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Journey reviews are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "JourneyReview_prevent_update" BEFORE UPDATE ON "JourneyReview" FOR EACH ROW EXECUTE FUNCTION "prevent_journey_review_mutation"();
CREATE TRIGGER "JourneyReview_prevent_delete" BEFORE DELETE ON "JourneyReview" FOR EACH ROW EXECUTE FUNCTION "prevent_journey_review_mutation"();

CREATE FUNCTION "prevent_review_deadline_rewrite"() RETURNS trigger AS $$
BEGIN
  IF OLD."reviewDeadlineAt" IS NOT NULL AND OLD."reviewDeadlineAt" IS DISTINCT FROM NEW."reviewDeadlineAt" THEN
    RAISE EXCEPTION 'Journey review deadlines are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Trip_reviewDeadline_immutable" BEFORE UPDATE ON "Trip" FOR EACH ROW EXECUTE FUNCTION "prevent_review_deadline_rewrite"();
