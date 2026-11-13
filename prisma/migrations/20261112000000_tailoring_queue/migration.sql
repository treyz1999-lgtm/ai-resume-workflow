ALTER TABLE "TailoringSelection" ADD COLUMN "position" SERIAL,
 ADD COLUMN "status" TEXT NOT NULL DEFAULT 'QUEUED', ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'Waiting',
 ADD COLUMN "owner" TEXT, ADD COLUMN "leaseUntil" TIMESTAMP(3), ADD COLUMN "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "error" TEXT, ADD COLUMN "kbSnapshotId" TEXT REFERENCES "KnowledgeSnapshot"("id"),
 ADD COLUMN "frozen" JSONB, ADD COLUMN "plan" JSONB, ADD COLUMN "content" JSONB, ADD COLUMN "themeSnapshot" JSONB,
 ADD COLUMN "score" INTEGER, ADD COLUMN "matchReport" JSONB,
 ADD CHECK ("status" IN ('QUEUED','RUNNING','FAILED','CANCELLED','PENDING'));
WITH numbered AS (SELECT id,row_number() OVER (ORDER BY "createdAt",id) AS n FROM "TailoringSelection")
 UPDATE "TailoringSelection" s SET position=n FROM numbered WHERE s.id=numbered.id;
CREATE UNIQUE INDEX "TailoringSelection_position_key" ON "TailoringSelection"("position");
CREATE UNIQUE INDEX "TailoringSelection_one_running" ON "TailoringSelection"((1)) WHERE status='RUNNING';
CREATE TABLE "TailoringControl" ("id" TEXT PRIMARY KEY DEFAULT 'queue', "paused" BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE "TailoringRevision" ("id" TEXT PRIMARY KEY, "runId" TEXT NOT NULL REFERENCES "TailoringSelection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('resume','letter')), "format" TEXT NOT NULL CHECK ("format" IN ('latex','html')),
 "source" TEXT NOT NULL, "pdf" BYTEA NOT NULL, "preview" BYTEA NOT NULL, "text" TEXT NOT NULL,
 "verification" JSONB NOT NULL, "evidence" JSONB NOT NULL, "matchReport" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "TailoringRevision_runId_kind_key" ON "TailoringRevision"("runId","kind");
