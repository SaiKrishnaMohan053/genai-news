-- AlterTable
ALTER TABLE "research_runs" ADD COLUMN     "executionToken" TEXT,
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "research_runs_status_leaseExpiresAt_idx" ON "research_runs"("status", "leaseExpiresAt");
