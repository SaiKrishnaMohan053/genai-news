import {
  INITIAL_STORY_CLUSTERING_VERSION,
  STORY_V1_SEMANTIC_MATCH_THRESHOLD,
} from '@genai-news/shared';

import { describe, expect, it } from 'vitest';

import { phase2ReleaseBaseline } from '../../src/news/story-clustering/baselines/phase2-release-baseline.js';
import { phase2StoryClusteringBaseline } from '../../src/news/story-clustering/baselines/phase2-story-clustering.js';

describe('Phase 2 release baseline', () => {
  it('pins the frozen Phase 2 v1 release contract', () => {
    expect(phase2ReleaseBaseline).toEqual({
      id: 'phase2-release-v1',

      corpusId: 'phase2-story-clustering-v1',

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,

      semanticPolicy: {
        model: 'text-embedding-3-small',

        minimumSimilarity: STORY_V1_SEMANTIC_MATCH_THRESHOLD,

        expectedMetrics: {
          truePositive: 9,

          falsePositive: 0,

          trueNegative: 12,

          falseNegative: 0,

          precision: 1,

          recall: 1,

          falseMergeRate: 0,

          falseSplitRate: 0,
        },
      },

      invariants: {
        representativePolicy: 'seed-stable',

        allowImplicitReassignment: false,

        allowImplicitMerge: false,

        allowAutomaticSplit: false,

        ambiguousMultipleMatchesSeedNewStory: true,
      },
    });
  });

  it('requires zero false merges and zero false splits for the frozen semantic policy', () => {
    expect(phase2ReleaseBaseline.semanticPolicy.expectedMetrics.falsePositive).toBe(0);

    expect(phase2ReleaseBaseline.semanticPolicy.expectedMetrics.falseNegative).toBe(0);

    expect(phase2ReleaseBaseline.semanticPolicy.expectedMetrics.falseMergeRate).toBe(0);

    expect(phase2ReleaseBaseline.semanticPolicy.expectedMetrics.falseSplitRate).toBe(0);
  });

  it('targets the current labelled Phase 2 clustering corpus', () => {
    expect(phase2ReleaseBaseline.corpusId).toBe(phase2StoryClusteringBaseline.id);
  });
});
