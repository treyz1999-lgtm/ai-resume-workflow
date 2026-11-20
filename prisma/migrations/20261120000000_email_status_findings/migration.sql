CREATE TABLE "EmailStatusFinding" (
  "id" TEXT PRIMARY KEY,
  "messageId" TEXT NOT NULL UNIQUE,
  "threadId" TEXT NOT NULL,
  "emailDate" TIMESTAMP(3) NOT NULL,
  "company" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "candidates" JSONB NOT NULL,
  "applicationId" TEXT,
  "result" TEXT NOT NULL DEFAULT 'REVIEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EmailStatusFinding_emailDate_idx" ON "EmailStatusFinding"("emailDate");
CREATE INDEX "EmailStatusFinding_applicationId_emailDate_idx" ON "EmailStatusFinding"("applicationId", "emailDate");
