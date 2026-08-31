import type {
  StoryClusteringEvaluationCorpus,
  StoryClusteringEvaluationScenario,
} from './contracts.js';

export function validateStoryClusteringEvaluationCorpus(
  corpus: StoryClusteringEvaluationCorpus,
): void {
  assertNonEmptyString(corpus.id, 'Story clustering corpus id');
  assertNonEmptyString(corpus.description, 'Story clustering corpus description');

  if (corpus.scenarios.length === 0) {
    throw new Error('Story clustering corpus must contain at least one scenario.');
  }

  const scenarioIds = new Set<string>();

  for (const scenario of corpus.scenarios) {
    if (scenarioIds.has(scenario.id)) {
      throw new Error(`Duplicate story clustering scenario id: ${scenario.id}`);
    }

    scenarioIds.add(scenario.id);

    validateScenario(scenario);
  }
}

function validateScenario(scenario: StoryClusteringEvaluationScenario): void {
  assertNonEmptyString(scenario.id, 'Story clustering scenario id');
  assertNonEmptyString(scenario.description, 'Story clustering scenario description');

  if (scenario.tags.length === 0) {
    throw new Error(
      `Story clustering scenario ${scenario.id} must contain at least one evaluation tag.`,
    );
  }

  if (scenario.articles.length === 0) {
    throw new Error(`Story clustering scenario ${scenario.id} must contain at least one article.`);
  }

  if (scenario.expectedClusters.length === 0) {
    throw new Error(
      `Story clustering scenario ${scenario.id} must contain at least one expected cluster.`,
    );
  }

  const articleIds = new Set<string>();
  const canonicalUrls = new Set<string>();

  for (const article of scenario.articles) {
    assertNonEmptyString(article.id, `Article id in scenario ${scenario.id}`);
    assertNonEmptyString(article.title, `Article title in scenario ${scenario.id}`);
    assertNonEmptyString(article.canonicalUrl, `Article canonicalUrl in scenario ${scenario.id}`);

    if (articleIds.has(article.id)) {
      throw new Error(
        `Duplicate article id ${article.id} in story clustering scenario ${scenario.id}.`,
      );
    }

    articleIds.add(article.id);

    if (canonicalUrls.has(article.canonicalUrl)) {
      throw new Error(
        `Duplicate canonicalUrl ${article.canonicalUrl} in story clustering scenario ${scenario.id}.`,
      );
    }

    canonicalUrls.add(article.canonicalUrl);

    if (article.publishedAt !== null && Number.isNaN(article.publishedAt.getTime())) {
      throw new Error(
        `Article ${article.id} in scenario ${scenario.id} has an invalid publishedAt.`,
      );
    }
  }

  const expectedClusterIds = new Set<string>();
  const assignedArticleIds = new Set<string>();

  for (const cluster of scenario.expectedClusters) {
    assertNonEmptyString(cluster.clusterId, `Expected cluster id in scenario ${scenario.id}`);

    if (expectedClusterIds.has(cluster.clusterId)) {
      throw new Error(
        `Duplicate expected cluster id ${cluster.clusterId} in scenario ${scenario.id}.`,
      );
    }

    expectedClusterIds.add(cluster.clusterId);

    if (cluster.articleIds.length === 0) {
      throw new Error(
        `Expected cluster ${cluster.clusterId} in scenario ${scenario.id} must not be empty.`,
      );
    }

    for (const articleId of cluster.articleIds) {
      if (!articleIds.has(articleId)) {
        throw new Error(
          `Expected cluster ${cluster.clusterId} in scenario ${scenario.id} references unknown article ${articleId}.`,
        );
      }

      if (assignedArticleIds.has(articleId)) {
        throw new Error(
          `Article ${articleId} appears in more than one expected cluster in scenario ${scenario.id}.`,
        );
      }

      assignedArticleIds.add(articleId);
    }
  }

  for (const articleId of articleIds) {
    if (!assignedArticleIds.has(articleId)) {
      throw new Error(
        `Article ${articleId} is missing from expected clusters in scenario ${scenario.id}.`,
      );
    }
  }

  if (scenario.processingSequences !== undefined) {
    const processingSequenceIds = new Set<string>();

    for (const sequence of scenario.processingSequences) {
      assertNonEmptyString(sequence.id, `Processing sequence id in scenario ${scenario.id}`);

      if (processingSequenceIds.has(sequence.id)) {
        throw new Error(
          `Duplicate processing sequence id ${sequence.id} in scenario ${scenario.id}.`,
        );
      }

      processingSequenceIds.add(sequence.id);

      if (sequence.articleIds.length === 0) {
        throw new Error(
          `Processing sequence ${sequence.id} in scenario ${scenario.id} must not be empty.`,
        );
      }

      const observedArticleIds = new Set<string>();

      for (const articleId of sequence.articleIds) {
        if (!articleIds.has(articleId)) {
          throw new Error(
            `Processing sequence ${sequence.id} in scenario ${scenario.id} references unknown article ${articleId}.`,
          );
        }

        observedArticleIds.add(articleId);
      }

      for (const articleId of articleIds) {
        if (!observedArticleIds.has(articleId)) {
          throw new Error(
            `Processing sequence ${sequence.id} in scenario ${scenario.id} never processes article ${articleId}.`,
          );
        }
      }
    }
  }
}

function assertNonEmptyString(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
}
