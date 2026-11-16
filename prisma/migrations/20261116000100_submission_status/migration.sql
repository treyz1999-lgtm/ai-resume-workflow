ALTER TABLE "TailoringSelection" DROP CONSTRAINT "TailoringSelection_status_check",
  ADD CONSTRAINT "TailoringSelection_status_check"
  CHECK ("status" IN ('QUEUED','RUNNING','FAILED','CANCELLED','PENDING','SUBMITTED'));
