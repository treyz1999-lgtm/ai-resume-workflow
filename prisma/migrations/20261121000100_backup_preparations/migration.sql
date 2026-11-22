CREATE TABLE "BackupPreparation" (
  "id" SERIAL PRIMARY KEY,
  "runId" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "BackupPreparation" ("runId")
SELECT id FROM "TailoringSelection" WHERE status IN ('PENDING','SUBMITTED');
CREATE FUNCTION count_ready_preparation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('PENDING','SUBMITTED') THEN
    INSERT INTO "BackupPreparation" ("runId") VALUES (NEW.id) ON CONFLICT ("runId") DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER count_ready_preparation AFTER UPDATE OF status ON "TailoringSelection"
FOR EACH ROW EXECUTE FUNCTION count_ready_preparation();
