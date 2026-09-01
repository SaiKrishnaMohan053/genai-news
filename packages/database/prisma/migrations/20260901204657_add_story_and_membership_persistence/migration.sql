-- CreateEnum
CREATE TYPE "StoryMembershipKind" AS ENUM ('SEED', 'MATCHED');

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "canonicalTitle" TEXT NOT NULL,
    "seedArticleId" TEXT NOT NULL,
    "representativeArticleId" TEXT NOT NULL,
    "clusteringVersion" TEXT NOT NULL,
    "firstPublishedAt" TIMESTAMP(3),
    "lastPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_memberships" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "kind" "StoryMembershipKind" NOT NULL,
    "score" DOUBLE PRECISION,
    "signals" JSONB,
    "reason" TEXT,
    "matchedAgainstArticleId" TEXT,
    "clusteringVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stories_seedArticleId_key" ON "stories"("seedArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "stories_representativeArticleId_key" ON "stories"("representativeArticleId");

-- CreateIndex
CREATE INDEX "stories_firstPublishedAt_idx" ON "stories"("firstPublishedAt");

-- CreateIndex
CREATE INDEX "stories_lastPublishedAt_idx" ON "stories"("lastPublishedAt");

-- CreateIndex
CREATE INDEX "stories_clusteringVersion_idx" ON "stories"("clusteringVersion");

-- CreateIndex
CREATE UNIQUE INDEX "story_memberships_articleId_key" ON "story_memberships"("articleId");

-- CreateIndex
CREATE INDEX "story_memberships_storyId_idx" ON "story_memberships"("storyId");

-- CreateIndex
CREATE INDEX "story_memberships_clusteringVersion_idx" ON "story_memberships"("clusteringVersion");

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_seedArticleId_fkey" FOREIGN KEY ("seedArticleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_representativeArticleId_fkey" FOREIGN KEY ("representativeArticleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_memberships" ADD CONSTRAINT "story_memberships_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_memberships" ADD CONSTRAINT "story_memberships_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
