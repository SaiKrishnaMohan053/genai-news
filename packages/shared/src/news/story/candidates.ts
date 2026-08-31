import type {
  StoryCandidate,
  StoryCandidateDecision,
  StoryCandidateGenerationPolicy,
  StoryCandidateGenerationResult,
  StoryFeatures,
} from './contracts.js';

export type GenerateStoryCandidatesInput = {
  article: StoryFeatures;

  stories: readonly StoryCandidate[];

  policy: StoryCandidateGenerationPolicy;
};

/**
 * Produces an explainable, deterministic high-recall candidate set for later
 * story similarity evaluation.
 *
 * This function does not:
 *
 * - calculate lexical similarity;
 * - rank candidates;
 * - select a best match;
 * - assign story membership;
 * - mutate persistence.
 */
export function generateStoryCandidates(
  input: GenerateStoryCandidatesInput,
): StoryCandidateGenerationResult {
  validatePolicy(input.policy);
  validateIncomingArticle(input.article);

  const observedStoryIds = new Set<string>();

  const candidates: StoryCandidate[] = [];
  const decisions: StoryCandidateDecision[] = [];

  for (const story of input.stories) {
    validateCandidateStory(story);

    if (observedStoryIds.has(story.storyId)) {
      throw new Error(`Duplicate candidate story id: ${story.storyId}`);
    }

    observedStoryIds.add(story.storyId);

    const decision = evaluateCandidate(input.article, story, input.policy);

    decisions.push(decision);

    if (decision.included) {
      candidates.push(story);
    }
  }

  return {
    candidates,
    decisions,

    totalStories: input.stories.length,
    candidateCount: candidates.length,
    excludedCount: input.stories.length - candidates.length,
  };
}

function evaluateCandidate(
  article: StoryFeatures,
  story: StoryCandidate,
  policy: StoryCandidateGenerationPolicy,
): StoryCandidateDecision {
  if (
    article.publishedAt === null ||
    story.firstPublishedAt === null ||
    story.lastPublishedAt === null
  ) {
    return {
      storyId: story.storyId,

      included: policy.includeWhenTimeUnknown,

      reason: 'time-unknown',

      timeDistanceMs: null,
    };
  }

  const articlePublishedAtMs = article.publishedAt.getTime();
  const firstPublishedAtMs = story.firstPublishedAt.getTime();
  const lastPublishedAtMs = story.lastPublishedAt.getTime();

  if (articlePublishedAtMs >= firstPublishedAtMs && articlePublishedAtMs <= lastPublishedAtMs) {
    return {
      storyId: story.storyId,

      included: true,

      reason: 'time-overlap',

      timeDistanceMs: 0,
    };
  }

  const timeDistanceMs =
    articlePublishedAtMs < firstPublishedAtMs
      ? firstPublishedAtMs - articlePublishedAtMs
      : articlePublishedAtMs - lastPublishedAtMs;

  if (timeDistanceMs <= policy.maxTimeDistanceMs) {
    return {
      storyId: story.storyId,

      included: true,

      reason: 'within-time-window',

      timeDistanceMs,
    };
  }

  return {
    storyId: story.storyId,

    included: false,

    reason: 'outside-time-window',

    timeDistanceMs,
  };
}

function validatePolicy(policy: StoryCandidateGenerationPolicy): void {
  if (!Number.isFinite(policy.maxTimeDistanceMs) || policy.maxTimeDistanceMs < 0) {
    throw new Error('Story candidate maxTimeDistanceMs must be a finite non-negative number.');
  }
}

function validateIncomingArticle(article: StoryFeatures): void {
  if (article.publishedAt !== null && Number.isNaN(article.publishedAt.getTime())) {
    throw new Error('Incoming story feature publishedAt must be a valid Date when present.');
  }
}

function validateCandidateStory(story: StoryCandidate): void {
  if (story.storyId.trim().length === 0) {
    throw new Error('Candidate story id must be a non-empty string.');
  }

  validateNullableDate(story.firstPublishedAt, 'Candidate story firstPublishedAt');

  validateNullableDate(story.lastPublishedAt, 'Candidate story lastPublishedAt');

  if (
    story.firstPublishedAt !== null &&
    story.lastPublishedAt !== null &&
    story.firstPublishedAt.getTime() > story.lastPublishedAt.getTime()
  ) {
    throw new Error(
      `Candidate story ${story.storyId} firstPublishedAt must not be after lastPublishedAt.`,
    );
  }
}

function validateNullableDate(value: Date | null, field: string): void {
  if (value !== null && Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date when present.`);
  }
}
