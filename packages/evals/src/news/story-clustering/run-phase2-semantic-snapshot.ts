import { createOpenAiSemanticEmbeddingClient } from './semantic-embedding-client.js';

import { analyzeSemanticSimilarity } from './semantic-similarity-analysis.js';

import { analyzeStoryClusteringPairs } from './pairwise-analysis.js';

import { phase2StoryClusteringBaseline } from './baselines/phase2-story-clustering.js';

const apiKey = process.env.OPENAI_API_KEY;

if (apiKey === undefined || apiKey.trim().length === 0) {
  throw new Error('OPENAI_API_KEY is required to generate the Phase 2 semantic snapshot.');
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

console.log(
  JSON.stringify(
    {
      id: 'phase2-semantic-snapshot-v1',

      corpusId: phase2StoryClusteringBaseline.id,

      model,

      pairs: semantic.pairs,
    },
    null,
    2,
  ),
);
