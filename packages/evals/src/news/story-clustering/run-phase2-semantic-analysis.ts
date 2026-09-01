import { createOpenAiSemanticEmbeddingClient } from './semantic-embedding-client.js';

import { analyzeSemanticSimilarity } from './semantic-similarity-analysis.js';

import { STORY_V1_SEMANTIC_MATCH_THRESHOLD } from '@genai-news/shared';

import {
  analyzeSemanticThresholds,
  evaluateSemanticThreshold,
} from './semantic-threshold-analysis.js';

import { analyzeStoryClusteringPairs } from './pairwise-analysis.js';

import { phase2StoryClusteringBaseline } from './baselines/phase2-story-clustering.js';

const apiKey = process.env.OPENAI_API_KEY;

if (apiKey === undefined || apiKey.trim().length === 0) {
  throw new Error('OPENAI_API_KEY is required for the Phase 2 semantic similarity experiment.');
}

const model = process.env.PHASE2_EMBEDDING_MODEL ?? 'text-embedding-3-small';

const pairwise = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

const client = createOpenAiSemanticEmbeddingClient({
  apiKey,
  model,
});

const semantic = await analyzeSemanticSimilarity(
  phase2StoryClusteringBaseline,
  pairwise.pairs,
  client,
);

const thresholds = analyzeSemanticThresholds(semantic.pairs);

const frozenV1PolicyMetrics = evaluateSemanticThreshold(
  semantic.pairs,
  STORY_V1_SEMANTIC_MATCH_THRESHOLD,
);

console.log('');
console.log('Phase 2 Semantic Similarity Diagnostic');

console.log('');
console.log(`Corpus: ${phase2StoryClusteringBaseline.id}`);

console.log(`Model: ${model}`);

console.log(`Pairs: ${semantic.pairs.length}`);

console.log(`Same-story pairs: ${semantic.positivePairs.length}`);

console.log(`Different-story pairs: ${semantic.negativePairs.length}`);

console.log('');
console.log('Semantic similarity distribution');

console.log(
  [
    '  Same-story:',
    `min=${formatNullable(semantic.positiveSummary.min)}`,
    `mean=${formatNullable(semantic.positiveSummary.mean)}`,
    `max=${formatNullable(semantic.positiveSummary.max)}`,
  ].join(' '),
);

console.log(
  [
    '  Different-story:',
    `min=${formatNullable(semantic.negativeSummary.min)}`,
    `mean=${formatNullable(semantic.negativeSummary.mean)}`,
    `max=${formatNullable(semantic.negativeSummary.max)}`,
  ].join(' '),
);

console.log('');
console.log('Most semantically similar different-story pairs');

for (const pair of [...semantic.negativePairs]
  .sort((left, right) => right.semanticCosineSimilarity - left.semanticCosineSimilarity)
  .slice(0, 5)) {
  printPair(pair);
}

console.log('');
console.log('Least semantically similar same-story pairs');

for (const pair of [...semantic.positivePairs]
  .sort((left, right) => left.semanticCosineSimilarity - right.semanticCosineSimilarity)
  .slice(0, 5)) {
  printPair(pair);
}

console.log('');
console.log('Best semantic threshold by F1');

console.log(JSON.stringify(thresholds.bestF1, null, 2));

console.log('');
console.log('Best semantic threshold with zero false merges');

console.log(JSON.stringify(thresholds.bestZeroFalseMerge, null, 2));

console.log('');
console.log('Frozen Phase 2 v1 semantic decision policy');

console.log(`Threshold: ${STORY_V1_SEMANTIC_MATCH_THRESHOLD}`);

console.log(JSON.stringify(frozenV1PolicyMetrics, null, 2));

function printPair(pair: {
  scenarioId: string;
  leftArticleId: string;
  rightArticleId: string;
  semanticCosineSimilarity: number;
}): void {
  console.log(
    [
      `  ${pair.scenarioId}`,
      `${pair.leftArticleId} ↔ ${pair.rightArticleId}`,
      `semantic=${pair.semanticCosineSimilarity.toFixed(4)}`,
    ].join(' | '),
  );
}

function formatNullable(value: number | null): string {
  return value === null ? 'null' : value.toFixed(4);
}
