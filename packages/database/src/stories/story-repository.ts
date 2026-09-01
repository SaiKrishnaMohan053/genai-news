import type { StoryArticleId, StoryId, StoryMatchDecision } from '@genai-news/shared';

import type { DatabaseClient } from '../client.js';

type MatchedStoryDecision = Omit<StoryMatchDecision, 'decision'> & {
  decision: 'match';
};

export type PersistedStory = {
  id: string;

  canonicalTitle: string;

  seedArticleId: string;
  representativeArticleId: string;

  clusteringVersion: string;

  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
};

export type PersistedStoryMembership = {
  id: string;

  storyId: string;
  articleId: string;

  kind: 'SEED' | 'MATCHED';

  score: number | null;
  signals: unknown;
  reason: string | null;

  matchedAgainstArticleId: string | null;

  clusteringVersion: string;

  createdAt: Date;
};

export type CreateSeedStoryInput = {
  storyId: StoryId;

  seedArticleId: StoryArticleId;

  canonicalTitle: string;

  clusteringVersion: string;
};

export type AddMatchedStoryMembershipInput = {
  storyId: StoryId;

  articleId: StoryArticleId;

  representativeArticleId: StoryArticleId;

  matchDecision: MatchedStoryDecision;
};

export type SeedStoryPersistenceResult = {
  story: PersistedStory;

  membership: PersistedStoryMembership;

  created: boolean;
};

export type MatchedStoryMembershipPersistenceResult = {
  story: PersistedStory;

  membership: PersistedStoryMembership;

  created: boolean;
};

export type StoryRepository = {
  createSeedStory(input: CreateSeedStoryInput): Promise<SeedStoryPersistenceResult>;

  addMatchedMembership(
    input: AddMatchedStoryMembershipInput,
  ): Promise<MatchedStoryMembershipPersistenceResult>;

  findById(storyId: StoryId): Promise<PersistedStory | null>;

  findMembershipByArticleId(articleId: StoryArticleId): Promise<PersistedStoryMembership | null>;
};

export class StoryPersistenceConflictError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'StoryPersistenceConflictError';
  }
}

export function createStoryRepository(database: DatabaseClient): StoryRepository {
  return {
    async createSeedStory(input): Promise<SeedStoryPersistenceResult> {
      validateSeedInput(input);

      try {
        return await database.$transaction(async (transaction) => {
          const seedArticle = await transaction.article.findUnique({
            where: {
              id: input.seedArticleId,
            },

            select: {
              id: true,
              publishedAt: true,
            },
          });

          if (seedArticle === null) {
            throw new Error(`Cannot seed story from missing article: ${input.seedArticleId}`);
          }

          const existingStory = await transaction.story.findUnique({
            where: {
              id: input.storyId,
            },
          });

          const existingMembership = await transaction.storyMembership.findUnique({
            where: {
              articleId: input.seedArticleId,
            },
          });

          /**
           * Exact replay.
           *
           * The story and its seed membership already
           * exist exactly as requested, so return the
           * persisted state without creating anything.
           */
          if (existingStory !== null) {
            assertSeedStoryReplayCompatible(existingStory, existingMembership, input);

            return {
              story: mapStory(existingStory),

              membership: mapRequiredMembership(existingMembership),

              created: false,
            };
          }

          /**
           * The article already belongs to some story.
           * Phase 2 never silently reassigns it.
           */
          if (existingMembership !== null) {
            throw new StoryPersistenceConflictError(
              [
                'Seed article already belongs to another story.',
                `articleId=${input.seedArticleId}`,
                `existingStoryId=${existingMembership.storyId}`,
                `requestedStoryId=${input.storyId}`,
              ].join(' '),
            );
          }

          const story = await transaction.story.create({
            data: {
              id: input.storyId,

              canonicalTitle: input.canonicalTitle,

              seedArticleId: input.seedArticleId,

              representativeArticleId: input.seedArticleId,

              clusteringVersion: input.clusteringVersion,

              firstPublishedAt: seedArticle.publishedAt,

              lastPublishedAt: seedArticle.publishedAt,
            },
          });

          const membership = await transaction.storyMembership.create({
            data: {
              storyId: input.storyId,

              articleId: input.seedArticleId,

              kind: 'SEED',

              score: null,
              reason: null,

              matchedAgainstArticleId: null,

              clusteringVersion: input.clusteringVersion,
            },
          });

          return {
            story: mapStory(story),

            membership: mapMembership(membership),

            created: true,
          };
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        return recoverConcurrentSeedStory(database, input);
      }
    },

    async addMatchedMembership(input): Promise<MatchedStoryMembershipPersistenceResult> {
      validateMatchedInput(input);

      try {
        return await database.$transaction(async (transaction) => {
          const story = await transaction.story.findUnique({
            where: {
              id: input.storyId,
            },
          });

          if (story === null) {
            throw new Error(`Cannot add membership to missing story: ${input.storyId}`);
          }

          if (story.clusteringVersion !== input.matchDecision.clusteringVersion) {
            throw new StoryPersistenceConflictError(
              [
                'Story clustering version does not match membership decision.',
                `storyId=${story.id}`,
                `storyVersion=${story.clusteringVersion}`,
                `decisionVersion=${input.matchDecision.clusteringVersion}`,
              ].join(' '),
            );
          }

          if (story.representativeArticleId !== input.representativeArticleId) {
            throw new StoryPersistenceConflictError(
              [
                'Matched-against article is not the persisted story representative.',
                `storyId=${story.id}`,
                `expectedRepresentative=${story.representativeArticleId}`,
                `actualRepresentative=${input.representativeArticleId}`,
              ].join(' '),
            );
          }

          const article = await transaction.article.findUnique({
            where: {
              id: input.articleId,
            },

            select: {
              id: true,
              publishedAt: true,
            },
          });

          if (article === null) {
            throw new Error(`Cannot add missing article to story: ${input.articleId}`);
          }

          const existingMembership = await transaction.storyMembership.findUnique({
            where: {
              articleId: input.articleId,
            },
          });

          if (existingMembership !== null) {
            if (existingMembership.storyId !== input.storyId) {
              throw new StoryPersistenceConflictError(
                [
                  'Article already belongs to another story.',
                  `articleId=${input.articleId}`,
                  `existingStoryId=${existingMembership.storyId}`,
                  `requestedStoryId=${input.storyId}`,
                ].join(' '),
              );
            }

            assertMatchedMembershipReplayCompatible(existingMembership, input);

            return {
              story: mapStory(story),

              membership: mapMembership(existingMembership),

              created: false,
            };
          }

          const membership = await transaction.storyMembership.create({
            data: {
              storyId: input.storyId,

              articleId: input.articleId,

              kind: 'MATCHED',

              score: input.matchDecision.score,

              signals: toJsonObject(input.matchDecision.signals),

              reason: input.matchDecision.reason,

              matchedAgainstArticleId: input.representativeArticleId,

              clusteringVersion: input.matchDecision.clusteringVersion,
            },
          });

          const envelope = expandTemporalEnvelope(
            story.firstPublishedAt,
            story.lastPublishedAt,
            article.publishedAt,
          );

          const updatedStory = envelope.changed
            ? await transaction.story.update({
                where: {
                  id: story.id,
                },

                data: {
                  firstPublishedAt: envelope.firstPublishedAt,

                  lastPublishedAt: envelope.lastPublishedAt,
                },
              })
            : story;

          return {
            story: mapStory(updatedStory),

            membership: mapMembership(membership),

            created: true,
          };
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        return recoverConcurrentMatchedMembership(database, input);
      }
    },

    async findById(storyId): Promise<PersistedStory | null> {
      const story = await database.story.findUnique({
        where: {
          id: storyId,
        },
      });

      return story === null ? null : mapStory(story);
    },

    async findMembershipByArticleId(articleId): Promise<PersistedStoryMembership | null> {
      const membership = await database.storyMembership.findUnique({
        where: {
          articleId,
        },
      });

      return membership === null ? null : mapMembership(membership);
    },
  };
}

function validateSeedInput(input: CreateSeedStoryInput): void {
  assertNonEmpty(input.storyId, 'Story id');

  assertNonEmpty(input.seedArticleId, 'Seed article id');

  assertNormalizedText(input.canonicalTitle, 'Canonical title');

  assertNonEmpty(input.clusteringVersion, 'Clustering version');
}

function validateMatchedInput(input: AddMatchedStoryMembershipInput): void {
  assertNonEmpty(input.storyId, 'Story id');

  assertNonEmpty(input.articleId, 'Article id');

  assertNonEmpty(input.representativeArticleId, 'Representative article id');

  if (input.articleId === input.representativeArticleId) {
    throw new Error('Matched article cannot be the representative article itself.');
  }

  if (input.matchDecision.decision !== 'match') {
    throw new Error('Matched membership requires a match decision.');
  }
}

function assertSeedStoryReplayCompatible(
  story: {
    id: string;
    canonicalTitle: string;
    seedArticleId: string;
    representativeArticleId: string;
    clusteringVersion: string;
  },

  membership: {
    storyId: string;
    articleId: string;
    kind: string;
    clusteringVersion: string;
  } | null,

  input: CreateSeedStoryInput,
): void {
  const compatible =
    story.seedArticleId === input.seedArticleId &&
    story.representativeArticleId === input.seedArticleId &&
    story.canonicalTitle === input.canonicalTitle &&
    story.clusteringVersion === input.clusteringVersion &&
    membership !== null &&
    membership.storyId === input.storyId &&
    membership.articleId === input.seedArticleId &&
    membership.kind === 'SEED' &&
    membership.clusteringVersion === input.clusteringVersion;

  if (!compatible) {
    throw new StoryPersistenceConflictError(
      `Story id ${input.storyId} already exists with different seed-story state.`,
    );
  }
}

function assertMatchedMembershipReplayCompatible(
  membership: {
    storyId: string;
    articleId: string;
    kind: string;

    score: number | null;

    signals: unknown;

    reason: string | null;

    matchedAgainstArticleId: string | null;

    clusteringVersion: string;
  },

  input: AddMatchedStoryMembershipInput,
): void {
  const compatible =
    membership.kind === 'MATCHED' &&
    membership.storyId === input.storyId &&
    membership.articleId === input.articleId &&
    membership.score === input.matchDecision.score &&
    membership.reason === input.matchDecision.reason &&
    membership.matchedAgainstArticleId === input.representativeArticleId &&
    membership.clusteringVersion === input.matchDecision.clusteringVersion &&
    jsonValuesEqual(membership.signals, input.matchDecision.signals);

  if (!compatible) {
    throw new StoryPersistenceConflictError(
      [
        'Article already has different persisted membership provenance.',
        `articleId=${input.articleId}`,
        `storyId=${input.storyId}`,
      ].join(' '),
    );
  }
}

async function recoverConcurrentSeedStory(
  database: DatabaseClient,
  input: CreateSeedStoryInput,
): Promise<SeedStoryPersistenceResult> {
  const story = await database.story.findUnique({
    where: {
      id: input.storyId,
    },
  });

  const membership = await database.storyMembership.findUnique({
    where: {
      articleId: input.seedArticleId,
    },
  });

  /**
   * Another concurrent transaction may have won
   * with exactly the same seed-story request.
   */
  if (story !== null) {
    assertSeedStoryReplayCompatible(story, membership, input);

    return {
      story: mapStory(story),

      membership: mapRequiredMembership(membership),

      created: false,
    };
  }

  /**
   * The story id does not exist, but the seed article
   * already belongs to another story.
   */
  if (membership !== null) {
    throw new StoryPersistenceConflictError(
      [
        'Seed article already belongs to another story.',
        `articleId=${input.seedArticleId}`,
        `existingStoryId=${membership.storyId}`,
        `requestedStoryId=${input.storyId}`,
      ].join(' '),
    );
  }

  /**
   * PostgreSQL reported a uniqueness conflict, but the
   * resulting persisted state cannot be reconciled with
   * this request.
   */
  throw new StoryPersistenceConflictError(
    [
      'Concurrent seed-story persistence conflicted with existing state.',
      `storyId=${input.storyId}`,
      `seedArticleId=${input.seedArticleId}`,
    ].join(' '),
  );
}

async function recoverConcurrentMatchedMembership(
  database: DatabaseClient,
  input: AddMatchedStoryMembershipInput,
): Promise<MatchedStoryMembershipPersistenceResult> {
  const story = await database.story.findUnique({
    where: {
      id: input.storyId,
    },
  });

  if (story === null) {
    throw new StoryPersistenceConflictError(
      `Story disappeared during concurrent membership persistence: ${input.storyId}`,
    );
  }

  const membership = await database.storyMembership.findUnique({
    where: {
      articleId: input.articleId,
    },
  });

  if (membership === null) {
    throw new StoryPersistenceConflictError(
      [
        'Concurrent matched membership failed without recoverable persisted membership.',
        `storyId=${input.storyId}`,
        `articleId=${input.articleId}`,
      ].join(' '),
    );
  }

  /**
   * A different story won the concurrent assignment race.
   * Phase 2 never silently reassigns the article.
   */
  if (membership.storyId !== input.storyId) {
    throw new StoryPersistenceConflictError(
      [
        'Article already belongs to another story.',
        `articleId=${input.articleId}`,
        `existingStoryId=${membership.storyId}`,
        `requestedStoryId=${input.storyId}`,
      ].join(' '),
    );
  }

  /**
   * The same story won the race.
   *
   * Treat this as an idempotent replay only when all
   * persisted provenance exactly matches this request.
   */
  assertMatchedMembershipReplayCompatible(membership, input);

  return {
    story: mapStory(story),

    membership: mapMembership(membership),

    created: false,
  };
}

function expandTemporalEnvelope(
  currentFirst: Date | null,
  currentLast: Date | null,
  incomingPublishedAt: Date | null,
): {
  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
  changed: boolean;
} {
  if (incomingPublishedAt === null) {
    return {
      firstPublishedAt: currentFirst,

      lastPublishedAt: currentLast,

      changed: false,
    };
  }

  const firstPublishedAt =
    currentFirst === null || incomingPublishedAt.getTime() < currentFirst.getTime()
      ? incomingPublishedAt
      : currentFirst;

  const lastPublishedAt =
    currentLast === null || incomingPublishedAt.getTime() > currentLast.getTime()
      ? incomingPublishedAt
      : currentLast;

  return {
    firstPublishedAt,
    lastPublishedAt,

    changed:
      !datesEqual(currentFirst, firstPublishedAt) || !datesEqual(currentLast, lastPublishedAt),
  };
}

function datesEqual(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.getTime() === right.getTime();
}

function mapStory(story: {
  id: string;

  canonicalTitle: string;

  seedArticleId: string;

  representativeArticleId: string;

  clusteringVersion: string;

  firstPublishedAt: Date | null;

  lastPublishedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}): PersistedStory {
  return {
    id: story.id,

    canonicalTitle: story.canonicalTitle,

    seedArticleId: story.seedArticleId,

    representativeArticleId: story.representativeArticleId,

    clusteringVersion: story.clusteringVersion,

    firstPublishedAt: story.firstPublishedAt,

    lastPublishedAt: story.lastPublishedAt,

    createdAt: story.createdAt,

    updatedAt: story.updatedAt,
  };
}

function mapMembership(membership: {
  id: string;

  storyId: string;
  articleId: string;

  kind: string;

  score: number | null;

  signals: unknown;

  reason: string | null;

  matchedAgainstArticleId: string | null;

  clusteringVersion: string;

  createdAt: Date;
}): PersistedStoryMembership {
  if (membership.kind !== 'SEED' && membership.kind !== 'MATCHED') {
    throw new Error(`Unexpected story membership kind: ${membership.kind}`);
  }

  return {
    id: membership.id,

    storyId: membership.storyId,

    articleId: membership.articleId,

    kind: membership.kind,

    score: membership.score,

    signals: membership.signals,

    reason: membership.reason,

    matchedAgainstArticleId: membership.matchedAgainstArticleId,

    clusteringVersion: membership.clusteringVersion,

    createdAt: membership.createdAt,
  };
}

function mapRequiredMembership(
  membership: Parameters<typeof mapMembership>[0] | null,
): PersistedStoryMembership {
  if (membership === null) {
    throw new StoryPersistenceConflictError('Existing story is missing its seed membership.');
  }

  return mapMembership(membership);
}

function toJsonObject(value: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(value));
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortJsonValue(left)) === JSON.stringify(sortJsonValue(right));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }

  return value;
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be non-empty.`);
  }
}

function assertNormalizedText(value: string, label: string): void {
  assertNonEmpty(value, label);

  if (value !== value.trim()) {
    throw new Error(`${label} must already be normalized.`);
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
