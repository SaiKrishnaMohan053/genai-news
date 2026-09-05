import {
  emitStructuredEvent,
  runWithSpan,
  type StoryClusteringMetrics,
  type StructuredEventLogger,
} from '@genai-news/observability';

import {
  assignArticleToStoryCluster,
  createStoryIdentityV1,
  decideStoryMatchV1,
  type StoryArticleId,
  type StoryAssignmentCandidate,
  type StoryId,
  type StoryNewClusterAssignmentReason,
} from '@genai-news/shared';

export type ClusterableArticle = {
  id: StoryArticleId;

  title: string;

  publishedAt: Date | null;
};

export type StoryClusteringCandidate = {
  storyId: StoryId;

  representativeArticle: {
    id: StoryArticleId;

    title: string;

    publishedAt: Date | null;
  };
};

export type ExistingStoryMembership = {
  storyId: StoryId;

  articleId: StoryArticleId;
};

export type SemanticStorySimilarityCandidate = {
  articleId: StoryArticleId;

  title: string;
};

export type SemanticStorySimilarityResult = {
  articleId: StoryArticleId;

  similarity: number;
};

export type SemanticStorySimilarityProvider = {
  compareAgainstCandidates(
    incomingTitle: string,

    candidates: readonly SemanticStorySimilarityCandidate[],
  ): Promise<readonly SemanticStorySimilarityResult[]>;
};

export type StoryClusteringArticleReader = {
  findById(articleId: StoryArticleId): Promise<ClusterableArticle | null>;
};

export type StoryClusteringMembershipReader = {
  findByArticleId(articleId: StoryArticleId): Promise<ExistingStoryMembership | null>;
};

export type StoryClusteringCandidateProvider = {
  findCandidates(article: ClusterableArticle): Promise<readonly StoryClusteringCandidate[]>;
};

export type StoryClusteringPersistence = {
  createSeedStory(input: {
    storyId: StoryId;

    seedArticleId: StoryArticleId;

    canonicalTitle: string;

    clusteringVersion: string;
  }): Promise<{
    story: {
      id: string;
    };

    created: boolean;
  }>;

  addMatchedMembership(input: {
    storyId: StoryId;

    articleId: StoryArticleId;

    representativeArticleId: StoryArticleId;

    matchDecision: {
      decision: 'match';

      score: number;

      signals: Readonly<Record<string, number>>;

      reason: string;

      clusteringVersion: string;
    };
  }): Promise<{
    story: {
      id: string;
    };

    created: boolean;
  }>;
};

export type StoryIdFactory = {
  createStoryId(): StoryId;
};

export type StoryClusteringDependencies = {
  articleReader: StoryClusteringArticleReader;

  membershipReader: StoryClusteringMembershipReader;

  candidateProvider: StoryClusteringCandidateProvider;

  semanticSimilarity: SemanticStorySimilarityProvider;

  persistence: StoryClusteringPersistence;

  storyIdFactory: StoryIdFactory;

  metrics?: StoryClusteringMetrics;

  logger?: StructuredEventLogger;
};

export type StoryAlreadyAssignedResult = {
  kind: 'already-assigned';

  articleId: StoryArticleId;

  storyId: StoryId;
};

export type StoryExistingAssignmentResult = {
  kind: 'assigned-existing-story';

  articleId: StoryArticleId;

  storyId: StoryId;

  representativeArticleId: StoryArticleId;

  semanticSimilarity: number;

  persisted: boolean;
};

export type StorySeedAssignmentResult = {
  kind: 'seeded-new-story';

  articleId: StoryArticleId;

  storyId: StoryId;

  reason: StoryNewClusterAssignmentReason;

  persisted: boolean;
};

export type StoryClusteringResult =
  StoryAlreadyAssignedResult | StoryExistingAssignmentResult | StorySeedAssignmentResult;

export function createStoryClusteringService(dependencies: StoryClusteringDependencies) {
  return {
    async clusterArticle(articleId: StoryArticleId): Promise<StoryClusteringResult> {
      assertArticleId(articleId);

      const clusteringStartedAt = performance.now();

      try {
        return await runWithSpan(
          {
            tracerName: 'genai-news-worker',

            spanName: 'story.cluster',

            attributes: {
              'story.article.id': articleId,
            },
          },

          async (span) => {
            /**
             * First idempotency boundary.
             *
             * If this article is already a member,
             * clustering must not be recomputed.
             */
            const existingMembership =
              await dependencies.membershipReader.findByArticleId(articleId);

            if (existingMembership !== null) {
              span.setAttribute('story.assignment.outcome', 'already_assigned');

              span.setAttribute('story.id', existingMembership.storyId);

              span.setAttribute('story.candidate.count', 0);

              span.setAttribute('story.semantic.comparison_count', 0);

              dependencies.metrics?.attemptsTotal.inc({
                outcome: 'already_assigned',
              });

              if (dependencies.logger) {
                emitStructuredEvent({
                  logger: dependencies.logger,

                  event: 'story.clustering.already_assigned',

                  attributes: {
                    articleId,

                    storyId: existingMembership.storyId,
                  },
                });
              }

              return {
                kind: 'already-assigned',

                articleId,

                storyId: existingMembership.storyId,
              };
            }

            const article = await dependencies.articleReader.findById(articleId);

            if (article === null) {
              throw new Error(`Cannot cluster missing article: ${articleId}`);
            }

            assertNormalizedTitle(article.title);

            const candidateGenerationStartedAt = performance.now();

            const candidates = await runWithSpan(
              {
                tracerName: 'genai-news-worker',

                spanName: 'story.candidate_generation',

                attributes: {
                  'story.article.id': articleId,
                },
              },

              async (candidateSpan) => {
                const result = await dependencies.candidateProvider.findCandidates(article);

                candidateSpan.setAttribute('story.candidate.count', result.length);

                return result;
              },
            );

            dependencies.metrics?.candidateGenerationDurationSeconds.observe(
              (performance.now() - candidateGenerationStartedAt) / 1000,
            );

            dependencies.metrics?.candidatesTotal.inc(candidates.length);

            span.setAttribute('story.candidate.count', candidates.length);

            validateCandidates(candidates);

            let semanticResults: readonly SemanticStorySimilarityResult[] = [];

            if (candidates.length > 0) {
              const semanticComparisonStartedAt = performance.now();

              semanticResults = await runWithSpan(
                {
                  tracerName: 'genai-news-worker',

                  spanName: 'story.semantic_comparison',

                  attributes: {
                    'story.article.id': articleId,

                    'story.candidate.count': candidates.length,
                  },
                },

                async (semanticSpan) => {
                  const results = await dependencies.semanticSimilarity.compareAgainstCandidates(
                    article.title,

                    candidates.map((candidate) => ({
                      articleId: candidate.representativeArticle.id,

                      title: candidate.representativeArticle.title,
                    })),
                  );

                  semanticSpan.setAttribute('story.semantic.comparison_count', results.length);

                  return results;
                },
              );

              dependencies.metrics?.semanticComparisonDurationSeconds.observe(
                (performance.now() - semanticComparisonStartedAt) / 1000,
              );

              dependencies.metrics?.semanticComparisonsTotal.inc(candidates.length);
            }

            span.setAttribute('story.semantic.comparison_count', semanticResults.length);

            const similarityByRepresentativeId = new Map<StoryArticleId, number>();

            for (const result of semanticResults) {
              if (similarityByRepresentativeId.has(result.articleId)) {
                throw new Error(`Duplicate semantic similarity result: ${result.articleId}`);
              }

              similarityByRepresentativeId.set(result.articleId, result.similarity);
            }

            if (semanticResults.length !== candidates.length) {
              throw new Error(
                [
                  'Semantic similarity result count mismatch.',
                  `expected=${candidates.length}`,
                  `actual=${semanticResults.length}`,
                ].join(' '),
              );
            }

            const assignmentCandidates: StoryAssignmentCandidate[] = candidates.map((candidate) => {
              const representativeArticleId = candidate.representativeArticle.id;

              const semanticSimilarity = similarityByRepresentativeId.get(representativeArticleId);

              if (semanticSimilarity === undefined) {
                throw new Error(
                  `Missing semantic similarity result for representative article: ${representativeArticleId}`,
                );
              }

              return {
                storyId: candidate.storyId,

                representativeArticleId,

                decision: decideStoryMatchV1(semanticSimilarity),
              };
            });

            const assignment = assignArticleToStoryCluster(
              articleId,

              assignmentCandidates,
            );

            if (assignment.kind === 'assign-existing-story') {
              const persisted = await dependencies.persistence.addMatchedMembership({
                storyId: assignment.storyId,

                articleId,

                representativeArticleId: assignment.representativeArticleId,

                matchDecision: toMatchedDecision(assignment.matchDecision),
              });

              span.setAttribute('story.assignment.outcome', 'assigned_existing_story');

              span.setAttribute('story.id', assignment.storyId);

              span.setAttribute(
                'story.representative_article.id',
                assignment.representativeArticleId,
              );

              span.setAttribute('story.semantic_similarity', assignment.matchDecision.score);

              span.setAttribute('story.persistence.created', persisted.created);

              dependencies.metrics?.attemptsTotal.inc({
                outcome: 'assigned_existing_story',
              });

              if (dependencies.logger) {
                emitStructuredEvent({
                  logger: dependencies.logger,

                  event: 'story.clustering.assigned_existing_story',

                  attributes: {
                    articleId,

                    storyId: assignment.storyId,

                    representativeArticleId: assignment.representativeArticleId,

                    semanticSimilarity: assignment.matchDecision.score,

                    candidateCount: candidates.length,

                    persisted: persisted.created,

                    clusteringVersion: assignment.matchDecision.clusteringVersion,
                  },
                });
              }

              return {
                kind: 'assigned-existing-story',

                articleId,

                storyId: assignment.storyId,

                representativeArticleId: assignment.representativeArticleId,

                semanticSimilarity: assignment.matchDecision.score,

                persisted: persisted.created,
              };
            }

            const newStoryId = dependencies.storyIdFactory.createStoryId();

            const identity = createStoryIdentityV1(
              newStoryId,

              articleId,

              article.title,
            );

            const persisted = await dependencies.persistence.createSeedStory({
              storyId: identity.storyId,

              seedArticleId: identity.seedArticleId,

              canonicalTitle: identity.canonicalTitle,

              clusteringVersion: identity.clusteringVersion,
            });

            span.setAttribute('story.assignment.outcome', 'seeded_new_story');

            span.setAttribute('story.id', identity.storyId);

            span.setAttribute('story.seed.reason', assignment.reason);

            span.setAttribute('story.persistence.created', persisted.created);

            dependencies.metrics?.attemptsTotal.inc({
              outcome: 'seeded_new_story',
            });

            if (dependencies.logger) {
              emitStructuredEvent({
                logger: dependencies.logger,

                event: 'story.clustering.seeded_new_story',

                attributes: {
                  articleId,

                  storyId: identity.storyId,

                  reason: assignment.reason,

                  candidateCount: candidates.length,

                  persisted: persisted.created,

                  clusteringVersion: identity.clusteringVersion,
                },
              });
            }

            return {
              kind: 'seeded-new-story',

              articleId,

              storyId: identity.storyId,

              reason: assignment.reason,

              persisted: persisted.created,
            };
          },
        );
      } catch (error) {
        dependencies.metrics?.attemptsTotal.inc({
          outcome: 'failed',
        });

        if (dependencies.logger) {
          emitStructuredEvent({
            logger: dependencies.logger,

            event: 'story.clustering.failed',

            level: 'error',

            attributes: {
              articleId,
            },

            error,
          });
        }

        throw error;
      } finally {
        dependencies.metrics?.clusteringDurationSeconds.observe(
          (performance.now() - clusteringStartedAt) / 1000,
        );
      }
    },
  };
}

function toMatchedDecision(decision: StoryAssignmentCandidate['decision']): {
  decision: 'match';

  score: number;

  signals: Readonly<Record<string, number>>;

  reason: string;

  clusteringVersion: string;
} {
  if (decision.decision !== 'match') {
    throw new Error('Existing-story assignment requires a match decision.');
  }

  return {
    decision: 'match',

    score: decision.score,

    signals: decision.signals,

    reason: decision.reason,

    clusteringVersion: decision.clusteringVersion,
  };
}

function validateCandidates(candidates: readonly StoryClusteringCandidate[]): void {
  const storyIds = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.storyId.trim().length === 0) {
      throw new Error('Story candidate id must be non-empty.');
    }

    if (storyIds.has(candidate.storyId)) {
      throw new Error(`Duplicate clustering candidate: ${candidate.storyId}`);
    }

    storyIds.add(candidate.storyId);

    if (candidate.representativeArticle.id.trim().length === 0) {
      throw new Error('Representative article id must be non-empty.');
    }

    assertNormalizedTitle(candidate.representativeArticle.title);
  }
}

function assertArticleId(articleId: StoryArticleId): void {
  if (articleId.trim().length === 0) {
    throw new Error('Story clustering article id must be non-empty.');
  }
}

function assertNormalizedTitle(title: string): void {
  if (title.trim().length === 0) {
    throw new Error('Story clustering title must be non-empty.');
  }

  if (title !== title.trim()) {
    throw new Error('Story clustering title must already be normalized.');
  }
}
