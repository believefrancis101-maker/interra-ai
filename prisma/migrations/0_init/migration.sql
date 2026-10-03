-- Initial migration for JobPrep AI database schema

-- CreateTable User
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable Job
CREATE TABLE IF NOT EXISTS "Job" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "result" JSONB,
    "rawOutput" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costMicroUsd" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "parentJobId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- Unique index on User email
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- Foreign key constraints
ALTER TABLE "Job" DROP CONSTRAINT IF EXISTS "Job_userId_fkey";
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Job" DROP CONSTRAINT IF EXISTS "Job_parentJobId_fkey";
ALTER TABLE "Job" ADD CONSTRAINT "Job_parentJobId_fkey" FOREIGN KEY ("parentJobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Standard indexes for queue and queries
CREATE INDEX IF NOT EXISTS "Job_status_createdAt_idx" ON "Job"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Job_userId_idx" ON "Job"("userId");
CREATE INDEX IF NOT EXISTS "Job_parentJobId_idx" ON "Job"("parentJobId");

-- CHECK Constraints
ALTER TABLE "Job" DROP CONSTRAINT IF EXISTS "check_job_status";
ALTER TABLE "Job" ADD CONSTRAINT "check_job_status" CHECK ("status" IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED'));

ALTER TABLE "Job" DROP CONSTRAINT IF EXISTS "check_job_type";
ALTER TABLE "Job" ADD CONSTRAINT "check_job_type" CHECK ("type" IN ('ANALYZE', 'PREPARE'));

ALTER TABLE "Job" DROP CONSTRAINT IF EXISTS "check_job_error_code";
ALTER TABLE "Job" ADD CONSTRAINT "check_job_error_code" CHECK (
    "errorCode" IS NULL OR "errorCode" IN ('TIMEOUT', 'RATE_LIMITED', 'PROVIDER_ERROR', 'INVALID_OUTPUT', 'NOT_A_JOB_DESCRIPTION', 'STALE')
);

-- Partial Unique Index (Mandated by AGENTS.md):
-- At most one live PREPARE job per parent completed ANALYZE job
CREATE UNIQUE INDEX IF NOT EXISTS "unique_live_prepare_per_parent"
ON "Job" ("parentJobId")
WHERE "type" = 'PREPARE' AND "status" IN ('PENDING', 'PROCESSING');
