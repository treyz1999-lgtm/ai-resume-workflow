-- Removing a tracker entry leaves its verified preparation available to the user.
CREATE FUNCTION release_submitted_preparation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "TailoringSelection" SET status = 'PENDING', stage = 'Pending submission'
  WHERE id = OLD."runId" AND status = 'SUBMITTED';
  RETURN OLD;
END
$$;

CREATE TRIGGER release_submitted_preparation
AFTER DELETE ON "TailoringSubmission"
FOR EACH ROW EXECUTE FUNCTION release_submitted_preparation();
