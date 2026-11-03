CREATE TABLE "DiscoveryControl" (
 "id" TEXT NOT NULL DEFAULT 'discovery', "config" JSONB NOT NULL,
 "nextTickAt" TIMESTAMP(3), "sessionUntil" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DiscoveryControl_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscoveryScan" (
 "id" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'QUEUED', "manual" BOOLEAN NOT NULL DEFAULT false,
 "input" JSONB, "config" JSONB, "kbSnapshotId" TEXT, "checkpoint" JSONB,
 "owner" TEXT, "leaseUntil" TIMESTAMP(3), "stage" TEXT, "sourceResults" JSONB, "error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3),
 CONSTRAINT "DiscoveryScan_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DiscoveryScan_status_check" CHECK ("status" IN ('QUEUED','RUNNING','COMPLETED','FAILED','INTERRUPTED'))
);
CREATE INDEX "DiscoveryScan_status_createdAt_idx" ON "DiscoveryScan"("status", "createdAt");
CREATE UNIQUE INDEX "DiscoveryScan_one_active" ON "DiscoveryScan" ((1)) WHERE "status" IN ('QUEUED','RUNNING');
CREATE TABLE "DiscoveryPosting" (
 "id" TEXT NOT NULL, "identityKey" TEXT NOT NULL, "occurrenceKey" TEXT NOT NULL,
 "source" TEXT NOT NULL, "externalId" TEXT NOT NULL, "url" TEXT NOT NULL DEFAULT '',
 "company" TEXT NOT NULL DEFAULT '', "role" TEXT NOT NULL DEFAULT '', "jd" TEXT NOT NULL,
 "complete" BOOLEAN NOT NULL DEFAULT false, "postingEvidence" JSONB NOT NULL, "postedAt" TIMESTAMP(3),
 "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "sightings" INTEGER NOT NULL DEFAULT 1, "extracted" JSONB, "coverage" JSONB, "kbSnapshotId" TEXT,
 "state" TEXT NOT NULL DEFAULT 'NEW', "analysisError" TEXT,
 CONSTRAINT "DiscoveryPosting_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DiscoveryPosting_state_check" CHECK ("state" IN ('NEW','SAVED','DISMISSED'))
);
CREATE UNIQUE INDEX "DiscoveryPosting_occurrenceKey_key" ON "DiscoveryPosting"("occurrenceKey");
CREATE INDEX "DiscoveryPosting_identityKey_firstSeenAt_idx" ON "DiscoveryPosting"("identityKey","firstSeenAt");
CREATE INDEX "DiscoveryPosting_state_lastSeenAt_idx" ON "DiscoveryPosting"("state","lastSeenAt");
CREATE TABLE "TailoringSelection" (
 "id" TEXT NOT NULL, "postingId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TailoringSelection_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "TailoringSelection_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "DiscoveryPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TailoringSelection_postingId_key" ON "TailoringSelection"("postingId");
