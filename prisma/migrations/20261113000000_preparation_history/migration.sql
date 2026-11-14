ALTER TABLE "TailoringSelection" ADD COLUMN generation INTEGER NOT NULL DEFAULT 1, ADD COLUMN history JSONB;
ALTER TABLE "TailoringRevision" ADD COLUMN generation INTEGER NOT NULL DEFAULT 1;
DROP INDEX "TailoringRevision_runId_kind_key";
CREATE UNIQUE INDEX "TailoringRevision_runId_kind_generation_key" ON "TailoringRevision"("runId","kind","generation");
