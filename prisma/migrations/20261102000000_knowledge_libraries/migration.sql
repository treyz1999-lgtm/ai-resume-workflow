CREATE TABLE "KnowledgeDetail" (
  "kind" TEXT NOT NULL CHECK ("kind" IN ('project', 'experience')),
  "entryId" TEXT NOT NULL,
  "context" TEXT NOT NULL DEFAULT '',
  "architecture" TEXT NOT NULL DEFAULT '',
  "architectureImage" TEXT NOT NULL DEFAULT '',
  "includeSwe" BOOLEAN NOT NULL DEFAULT true,
  "includeData" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("kind", "entryId")
);
CREATE TABLE "KnowledgeSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "version" SERIAL NOT NULL UNIQUE,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "digest" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ResumeAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "preview" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
