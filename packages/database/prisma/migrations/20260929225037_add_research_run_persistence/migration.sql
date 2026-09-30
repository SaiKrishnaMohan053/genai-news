-- CreateEnum
CREATE TYPE "ResearchRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ResearchRunOutcome" AS ENUM ('COMPLETE', 'PARTIAL', 'INSUFFICIENT_SOURCES', 'FAILED');

-- CreateEnum
CREATE TYPE "ResearchRunStopReason" AS ENUM ('CRITERIA_SATISFIED', 'NO_USEFUL_RESULTS', 'TOOL_BUDGET_EXHAUSTED', 'MODEL_BUDGET_EXHAUSTED', 'DEADLINE_EXCEEDED', 'TERMINAL_FAILURE');

-- CreateTable
CREATE TABLE "research_runs" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ResearchRunStatus" NOT NULL,
    "researchGoal" TEXT,
    "budget" JSONB NOT NULL,
    "outcome" "ResearchRunOutcome",
    "stopReason" "ResearchRunStopReason",
    "selection" JSONB,
    "modelCalls" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "research_runs_idempotencyKey_key" ON "research_runs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "research_runs_storyId_idx" ON "research_runs"("storyId");

-- CreateIndex
CREATE INDEX "research_runs_status_idx" ON "research_runs"("status");

-- CreateIndex
CREATE INDEX "research_runs_createdAt_idx" ON "research_runs"("createdAt");

-- AddForeignKey
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
