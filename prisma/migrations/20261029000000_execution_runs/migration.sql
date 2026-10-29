CREATE TABLE "ExecutionRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "model" TEXT,
  "prompt" TEXT NOT NULL,
  "threadId" TEXT,
  "turnId" TEXT,
  "stage" TEXT,
  "output" TEXT NOT NULL DEFAULT '',
  "result" JSONB,
  "error" TEXT,
  "owner" TEXT,
  "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExecutionRun_status_check" CHECK ("status" IN ('QUEUED','RUNNING','COMPLETED','CANCELLED','BLOCKED','INTERRUPTED','FAILED'))
);
CREATE INDEX "ExecutionRun_status_createdAt_idx" ON "ExecutionRun"("status", "createdAt");
