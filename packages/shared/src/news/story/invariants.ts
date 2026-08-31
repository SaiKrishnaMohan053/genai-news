import type {
  CanonicalStory,
  StoryArticleMembership,
  StoryMatchDecision,
  StoryMatchSignals,
} from './contracts.js';

/**
 * Validates invariants that belong to the Story domain itself.
 *
 * This function performs no persistence, similarity calculation, threshold
 * selection, or clustering assignment.
 */
export function assertCanonicalStory(story: CanonicalStory): void {
  assertNonEmptyString(story.id, 'Story id');
  assertNonEmptyString(story.canonicalTitle, 'Story canonicalTitle');

  assertValidNullableDate(story.firstPublishedAt, 'Story firstPublishedAt');
  assertValidNullableDate(story.lastPublishedAt, 'Story lastPublishedAt');

  if (
    story.firstPublishedAt !== null &&
    story.lastPublishedAt !== null &&
    story.firstPublishedAt.getTime() > story.lastPublishedAt.getTime()
  ) {
    throw new Error('Story firstPublishedAt must not be after lastPublishedAt.');
  }
}

export function assertStoryMatchDecision(decision: StoryMatchDecision): void {
  if (decision.decision !== 'match' && decision.decision !== 'no-match') {
    throw new Error('Story match decision must be match or no-match.');
  }

  assertNormalizedScore(decision.score, 'Story match score');

  assertNonEmptyString(decision.reason, 'Story match reason');

  assertNonEmptyString(decision.clusteringVersion, 'Story clusteringVersion');

  assertStoryMatchSignals(decision.signals);
}

export function assertStoryArticleMembership(membership: StoryArticleMembership): void {
  assertNonEmptyString(membership.storyId, 'Story membership storyId');
  assertNonEmptyString(membership.articleId, 'Story membership articleId');

  if (membership.provenance.kind === 'seed') {
    assertNonEmptyString(membership.provenance.clusteringVersion, 'Story seed clusteringVersion');

    return;
  }

  assertStoryMatchDecision(membership.provenance.decision);

  if (membership.provenance.decision.decision !== 'match') {
    throw new Error('Matched story membership must contain a positive match decision.');
  }
}

function assertStoryMatchSignals(signals: StoryMatchSignals): void {
  for (const [name, value] of Object.entries(signals)) {
    assertNonEmptyString(name, 'Story match signal name');
    assertNormalizedScore(value, `Story match signal "${name}"`);
  }
}

function assertNormalizedScore(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be a finite number between 0 and 1.`);
  }
}

function assertNonEmptyString(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
}

function assertValidNullableDate(value: Date | null, field: string): void {
  if (value !== null && Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date when present.`);
  }
}
