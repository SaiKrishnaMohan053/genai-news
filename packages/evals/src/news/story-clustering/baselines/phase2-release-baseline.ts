import {
  INITIAL_STORY_CLUSTERING_VERSION,
  STORY_V1_SEMANTIC_MATCH_THRESHOLD,
} from '@genai-news/shared';

export type Phase2ReleaseBaseline = {
  id: string;

  corpusId: string;

  clusteringVersion: string;

  semanticPolicy: {
    model: string;

    minimumSimilarity: number;

    expectedMetrics: {
      truePositive: number;

      falsePositive: number;

      trueNegative: number;

      falseNegative: number;

      precision: number;

      recall: number;

      falseMergeRate: number;

      falseSplitRate: number;
    };
  };

  invariants: {
    representativePolicy: 'seed-stable';

    allowImplicitReassignment: false;

    allowImplicitMerge: false;

    allowAutomaticSplit: false;

    ambiguousMultipleMatchesSeedNewStory: true;
  };
};

export const phase2ReleaseBaseline: Phase2ReleaseBaseline = {
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
};
