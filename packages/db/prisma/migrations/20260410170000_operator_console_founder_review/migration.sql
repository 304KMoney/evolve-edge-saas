-- Phase: operator console founder review and escalation state
ALTER TABLE "CustomerAccount"
ADD COLUMN "founderReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "founderReviewReason" TEXT,
ADD COLUMN "founderReviewRequestedAt" TIMESTAMP(3),
ADD COLUMN "founderReviewResolvedAt" TIMESTAMP(3);

CREATE INDEX "CustomerAccount_founderReviewRequired_nextActionDueAt_updatedAt_idx"
ON "CustomerAccount"("founderReviewRequired", "nextActionDueAt", "updatedAt");

ALTER TYPE "CustomerAccountTimelineEntryType"
ADD VALUE IF NOT EXISTS 'ESCALATION_UPDATED';
