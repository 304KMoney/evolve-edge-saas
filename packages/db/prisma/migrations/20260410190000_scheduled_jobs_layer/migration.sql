CREATE TYPE "ScheduledJobStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "ScheduledJobRun" (
  "id" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "triggerSource" TEXT NOT NULL,
  "status" "ScheduledJobStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "summaryJson" JSONB,
  "errorMessage" TEXT,

  CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledJobRun_jobName_startedAt_idx"
ON "ScheduledJobRun"("jobName", "startedAt");

CREATE INDEX "ScheduledJobRun_status_startedAt_idx"
ON "ScheduledJobRun"("status", "startedAt");
