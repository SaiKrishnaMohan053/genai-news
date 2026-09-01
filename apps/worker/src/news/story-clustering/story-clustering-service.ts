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

      /**
       * First idempotency boundary.
       *
       * If this article is already a member,
       * clustering must not be recomputed.
       */
      const existingMembership = await dependencies.membershipReader.findByArticleId(articleId);

      if (existingMembership !== null) {
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

      const candidates = await dependencies.candidateProvider.findCandidates(article);

      validateCandidates(candidates);

      const semanticResults =
        candidates.length === 0
          ? []
          : await dependencies.semanticSimilarity.compareAgainstCandidates(
              article.title,

              candidates.map((candidate) => ({
                articleId: candidate.representativeArticle.id,

                title: candidate.representativeArticle.title,
              })),
            );

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

      const assignment = assignArticleToStoryCluster(articleId, assignmentCandidates);

      if (assignment.kind === 'assign-existing-story') {
        /**
         * 2.7 guarantees exactly one matching
         * candidate in this branch.
         */
        const persisted = await dependencies.persistence.addMatchedMembership({
          storyId: assignment.storyId,

          articleId,

          representativeArticleId: assignment.representativeArticleId,

          matchDecision: toMatchedDecision(assignment.matchDecision),
        });

        return {
          kind: 'assigned-existing-story',

          articleId,

          storyId: assignment.storyId,

          representativeArticleId: assignment.representativeArticleId,

          semanticSimilarity: assignment.matchDecision.score,

          persisted: persisted.created,
        };
      }

      /**
       * No candidate, no match, or ambiguous multiple
       * matches all conservatively seed a new story.
       */
      const newStoryId = dependencies.storyIdFactory.createStoryId();

      const identity = createStoryIdentityV1(newStoryId, articleId, article.title);

      const persisted = await dependencies.persistence.createSeedStory({
        storyId: identity.storyId,

        seedArticleId: identity.seedArticleId,

        canonicalTitle: identity.canonicalTitle,

        clusteringVersion: identity.clusteringVersion,
      });

      return {
        kind: 'seeded-new-story',

        articleId,

        storyId: identity.storyId,

        reason: assignment.reason,

        persisted: persisted.created,
      };
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
