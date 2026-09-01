import {
  INITIAL_STORY_CLUSTERING_VERSION,
  type StoryArticleId,
  type StoryId,
  type StoryMatchDecision,
} from './contracts.js';

import { assertStoryMatchDecision } from './invariants.js';

export type StoryAssignmentCandidate = {
  storyId: StoryId;

  /**
   * Representative article used when producing
   * the candidate's StoryMatchDecision.
   *
   * The assignment algorithm itself does not
   * compare article content.
   */
  representativeArticleId: StoryArticleId;

  decision: StoryMatchDecision;
};

export type StoryExistingClusterAssignment = {
  kind: 'assign-existing-story';

  articleId: StoryArticleId;

  storyId: StoryId;

  representativeArticleId: StoryArticleId;

  matchDecision: StoryMatchDecision;

  consideredCandidateCount: number;
  matchingCandidateCount: 1;

  clusteringVersion: typeof INITIAL_STORY_CLUSTERING_VERSION;
};

export type StoryNewClusterAssignmentReason =
  'no-candidates' | 'no-matching-candidates' | 'ambiguous-matching-candidates';

export type StoryNewClusterAssignment = {
  kind: 'seed-new-story';

  articleId: StoryArticleId;

  reason: StoryNewClusterAssignmentReason;

  consideredCandidateCount: number;

  matchingCandidateCount: number;

  /**
   * Included only as deterministic diagnostic evidence.
   *
   * This is not permission to merge or reassign stories.
   */
  matchingStoryIds: readonly StoryId[];

  clusteringVersion: typeof INITIAL_STORY_CLUSTERING_VERSION;
};

export type StoryClusterAssignment = StoryExistingClusterAssignment | StoryNewClusterAssignment;

export function assignArticleToStoryCluster(
  articleId: StoryArticleId,
  candidates: readonly StoryAssignmentCandidate[],
): StoryClusterAssignment {
  assertArticleId(articleId);

  validateCandidates(candidates);

  if (candidates.length === 0) {
    return {
      kind: 'seed-new-story',

      articleId,

      reason: 'no-candidates',

      consideredCandidateCount: 0,

      matchingCandidateCount: 0,

      matchingStoryIds: [],

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    };
  }

  const matchingCandidates = candidates.filter(
    (candidate) => candidate.decision.decision === 'match',
  );

  if (matchingCandidates.length === 0) {
    return {
      kind: 'seed-new-story',

      articleId,

      reason: 'no-matching-candidates',

      consideredCandidateCount: candidates.length,

      matchingCandidateCount: 0,

      matchingStoryIds: [],

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    };
  }

  if (matchingCandidates.length > 1) {
    return {
      kind: 'seed-new-story',

      articleId,

      reason: 'ambiguous-matching-candidates',

      consideredCandidateCount: candidates.length,

      matchingCandidateCount: matchingCandidates.length,

      matchingStoryIds: matchingCandidates
        .map((candidate) => candidate.storyId)
        .sort(compareStoryIds),

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    };
  }

  const match = matchingCandidates[0]!;

  return {
    kind: 'assign-existing-story',

    articleId,

    storyId: match.storyId,

    representativeArticleId: match.representativeArticleId,

    matchDecision: match.decision,

    consideredCandidateCount: candidates.length,

    matchingCandidateCount: 1,

    clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
  };
}

function validateCandidates(candidates: readonly StoryAssignmentCandidate[]): void {
  const observedStoryIds = new Set<string>();

  for (const candidate of candidates) {
    assertStoryId(candidate.storyId);

    assertArticleId(candidate.representativeArticleId);

    if (observedStoryIds.has(candidate.storyId)) {
      throw new Error(`Duplicate story assignment candidate: ${candidate.storyId}`);
    }

    observedStoryIds.add(candidate.storyId);

    assertStoryMatchDecision(candidate.decision);

    if (candidate.decision.clusteringVersion !== INITIAL_STORY_CLUSTERING_VERSION) {
      throw new Error(
        [
          'Story assignment candidate uses an incompatible clustering version.',
          `storyId=${candidate.storyId}`,
          `expected=${INITIAL_STORY_CLUSTERING_VERSION}`,
          `actual=${candidate.decision.clusteringVersion}`,
        ].join(' '),
      );
    }
  }
}

function assertStoryId(storyId: StoryId): void {
  if (typeof storyId !== 'string' || storyId.trim().length === 0) {
    throw new Error('Story assignment candidate story id must be non-empty.');
  }
}

function assertArticleId(articleId: StoryArticleId): void {
  if (typeof articleId !== 'string' || articleId.trim().length === 0) {
    throw new Error('Story assignment article id must be non-empty.');
  }
}

function compareStoryIds(left: StoryId, right: StoryId): number {
  return left.localeCompare(right);
}
