-- Additive Phase 5A.1 exact-start contract. Existing Agreements intentionally remain NULL.
ALTER TABLE "Agreement" ADD COLUMN "agreedStartAt" TIMESTAMPTZ(3);

CREATE OR REPLACE FUNCTION "prevent_agreement_change"() RETURNS trigger AS $$
BEGIN
  IF OLD."agreedStartAt" IS DISTINCT FROM NEW."agreedStartAt" THEN
    RAISE EXCEPTION 'Agreement snapshots are immutable';
  END IF;
  RAISE EXCEPTION 'Agreement snapshots are immutable';
END;
$$ LANGUAGE plpgsql;

-- Safe rollback ordering: restore the prior function definition first, then drop
-- "agreedStartAt" only if no Phase 5A.1 Agreement data must be retained.
