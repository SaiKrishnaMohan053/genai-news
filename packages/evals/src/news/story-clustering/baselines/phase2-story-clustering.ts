import type { StoryClusteringEvaluationCorpus } from '../contracts.js';

const MINUTE_MS = 60 * 1000;

function at(base: string, minutes: number): Date {
  return new Date(new Date(base).getTime() + minutes * MINUTE_MS);
}

export const phase2StoryClusteringBaseline: StoryClusteringEvaluationCorpus = {
  id: 'phase2-story-clustering-v1',

  description: 'Golden labelled corpus for deterministic Phase 2 canonical story clustering.',

  scenarios: [
    {
      id: 'same-event-multiple-publishers',

      description:
        'Different publishers reporting the same product launch belong to one canonical story.',

      tags: ['clear-same-story', 'publisher-independent', 'headline-variation', 'multi-article'],

      articles: [
        {
          id: 'launch-a',
          title: 'Northstar AI launches Atlas One robotics platform',
          canonicalUrl: 'https://wire.example.com/northstar-atlas-one',
          publisherName: 'Global Wire',
          publishedAt: at('2026-08-31T10:00:00.000Z', 0),
        },
        {
          id: 'launch-b',
          title: 'Northstar AI unveils its Atlas One robotics platform',
          canonicalUrl: 'https://tech.example.com/atlas-one-launch',
          publisherName: 'Tech Daily',
          publishedAt: at('2026-08-31T10:00:00.000Z', 18),
        },
        {
          id: 'launch-c',
          title: 'Atlas One robotics platform introduced by Northstar AI',
          canonicalUrl: 'https://business.example.com/northstar-robotics',
          publisherName: 'Business Journal',
          publishedAt: at('2026-08-31T10:00:00.000Z', 47),
        },
      ],

      expectedClusters: [
        {
          clusterId: 'northstar-atlas-launch',
          articleIds: ['launch-a', 'launch-b', 'launch-c'],
        },
      ],
    },

    {
      id: 'same-event-time-variation',

      description:
        'Reports of the same acquisition remain one story despite publication-time variation.',

      tags: ['clear-same-story', 'time-variation', 'publisher-independent'],

      articles: [
        {
          id: 'acquisition-a',
          title: 'BluePeak agrees to acquire River Labs for $4 billion',
          canonicalUrl: 'https://wire.example.com/bluepeak-river-deal',
          publisherName: 'Global Wire',
          publishedAt: at('2026-08-31T08:00:00.000Z', 0),
        },
        {
          id: 'acquisition-b',
          title: 'River Labs to be acquired by BluePeak in $4 billion deal',
          canonicalUrl: 'https://finance.example.com/river-bluepeak',
          publisherName: 'Finance Daily',
          publishedAt: at('2026-08-31T08:00:00.000Z', 115),
        },
      ],

      expectedClusters: [
        {
          clusterId: 'bluepeak-river-acquisition',
          articleIds: ['acquisition-a', 'acquisition-b'],
        },
      ],
    },

    {
      id: 'same-company-different-events',

      description:
        'Articles sharing the same dominant company remain separate when they describe different events.',

      tags: ['clear-different-story', 'same-entity-different-event'],

      articles: [
        {
          id: 'company-launch',
          title: 'Northstar AI launches Atlas One robotics platform',
          canonicalUrl: 'https://example.com/northstar-launch',
          publisherName: 'Technology Post',
          publishedAt: at('2026-08-31T09:00:00.000Z', 0),
        },
        {
          id: 'company-earnings',
          title: 'Northstar AI reports stronger quarterly earnings',
          canonicalUrl: 'https://example.com/northstar-earnings',
          publisherName: 'Market Post',
          publishedAt: at('2026-08-31T09:00:00.000Z', 25),
        },
      ],

      expectedClusters: [
        {
          clusterId: 'northstar-launch',
          articleIds: ['company-launch'],
        },
        {
          clusterId: 'northstar-earnings',
          articleIds: ['company-earnings'],
        },
      ],
    },

    {
      id: 'same-person-different-events',

      description:
        'Articles about the same person remain separate when the underlying events differ.',

      tags: ['clear-different-story', 'same-entity-different-event'],

      articles: [
        {
          id: 'person-keynote',
          title: 'Maya Chen announces developer conference keynote',
          canonicalUrl: 'https://events.example.com/maya-chen-keynote',
          publisherName: 'Events Today',
          publishedAt: at('2026-08-31T11:00:00.000Z', 0),
        },
        {
          id: 'person-board',
          title: 'Maya Chen joins Horizon Systems board',
          canonicalUrl: 'https://business.example.com/maya-chen-board',
          publisherName: 'Business Journal',
          publishedAt: at('2026-08-31T11:00:00.000Z', 14),
        },
      ],

      expectedClusters: [
        {
          clusterId: 'maya-keynote',
          articleIds: ['person-keynote'],
        },
        {
          clusterId: 'maya-board',
          articleIds: ['person-board'],
        },
      ],
    },

    {
      id: 'same-keywords-different-events',

      description: 'Strong keyword overlap does not merge unrelated announcements.',

      tags: ['clear-different-story', 'same-keywords-different-event'],

      articles: [
        {
          id: 'keyword-a',
          title: 'VectorCloud launches new AI data center in Texas',
          canonicalUrl: 'https://infra.example.com/vectorcloud-texas',
          publisherName: 'Infrastructure News',
          publishedAt: at('2026-08-31T12:00:00.000Z', 0),
        },
        {
          id: 'keyword-b',
          title: 'NimbusAI launches new AI data center in Virginia',
          canonicalUrl: 'https://infra.example.com/nimbus-virginia',
          publisherName: 'Infrastructure News',
          publishedAt: at('2026-08-31T12:00:00.000Z', 8),
        },
      ],

      expectedClusters: [
        {
          clusterId: 'vectorcloud-texas',
          articleIds: ['keyword-a'],
        },
        {
          clusterId: 'nimbus-virginia',
          articleIds: ['keyword-b'],
        },
      ],
    },

    {
      id: 'difficult-primary-event-vs-related-event',

      description:
        'A product launch and a supplier preparation article are related topics but not the same canonical event.',

      tags: ['difficult-boundary', 'clear-different-story', 'same-entity-different-event'],

      articles: [
        {
          id: 'primary-launch',
          title: 'Orion Mobile launches the Nova X smartphone',
          canonicalUrl: 'https://mobile.example.com/orion-nova-x-launch',
          publisherName: 'Mobile Daily',
          publishedAt: at('2026-08-31T09:30:00.000Z', 0),
        },
        {
          id: 'supplier-prep',
          title: 'Orion supplier expands production ahead of Nova X demand',
          canonicalUrl: 'https://supply.example.com/orion-nova-x-production',
          publisherName: 'Supply Chain Review',
          publishedAt: at('2026-08-31T09:30:00.000Z', 20),
        },
      ],

      expectedClusters: [
        {
          clusterId: 'nova-x-launch',
          articleIds: ['primary-launch'],
        },
        {
          clusterId: 'nova-x-supplier-production',
          articleIds: ['supplier-prep'],
        },
      ],
    },

    {
      id: 'difficult-release-vs-integration',

      description:
        'A model release and a separate partner integration using that model remain separate canonical stories.',

      tags: ['difficult-boundary', 'clear-different-story', 'same-entity-different-event'],

      articles: [
        {
          id: 'model-release',
          title: 'Aster AI releases Model X',
          canonicalUrl: 'https://ai.example.com/aster-model-x-release',
          publisherName: 'AI Wire',
          publishedAt: at('2026-08-31T13:00:00.000Z', 0),
        },
        {
          id: 'partner-integration',
          title: 'Contoso integrates Aster AI Model X into Workspace',
          canonicalUrl: 'https://software.example.com/contoso-model-x',
          publisherName: 'Software Daily',
          publishedAt: at('2026-08-31T13:00:00.000Z', 35),
        },
      ],

      expectedClusters: [
        {
          clusterId: 'aster-model-x-release',
          articleIds: ['model-release'],
        },
        {
          clusterId: 'contoso-model-x-integration',
          articleIds: ['partner-integration'],
        },
      ],
    },

    {
      id: 'transitive-bridge-protection',

      description:
        'A bridge headline shares language with two events but must not cause unrelated events to collapse into one cluster.',

      tags: ['transitive-bridge', 'difficult-boundary', 'multi-article'],

      articles: [
        {
          id: 'bridge-a',
          title: 'Aster AI releases Model X',
          canonicalUrl: 'https://example.com/aster-model-x-release',
          publisherName: 'AI Wire',
          publishedAt: at('2026-08-31T14:00:00.000Z', 0),
        },
        {
          id: 'bridge-b',
          title: 'Aster Model X launch brings new developer tools',
          canonicalUrl: 'https://example.com/model-x-developer-launch',
          publisherName: 'Developer News',
          publishedAt: at('2026-08-31T14:00:00.000Z', 12),
        },
        {
          id: 'bridge-c',
          title: 'Contoso adds Aster Model X tools to Workspace',
          canonicalUrl: 'https://example.com/contoso-workspace-model-x',
          publisherName: 'Software Daily',
          publishedAt: at('2026-08-31T14:00:00.000Z', 24),
        },
      ],

      expectedClusters: [
        {
          clusterId: 'aster-release',
          articleIds: ['bridge-a', 'bridge-b'],
        },
        {
          clusterId: 'contoso-integration',
          articleIds: ['bridge-c'],
        },
      ],
    },

    {
      id: 'ordering-stability',

      description:
        'Equivalent input articles should produce the same final grouping under multiple processing orders.',

      tags: ['ordering-stability', 'multi-article', 'clear-same-story', 'clear-different-story'],

      articles: [
        {
          id: 'order-a',
          title: 'Helios Motors unveils the E7 electric sedan',
          canonicalUrl: 'https://cars.example.com/helios-e7-a',
          publisherName: 'Auto Wire',
          publishedAt: at('2026-08-31T15:00:00.000Z', 0),
        },
        {
          id: 'order-b',
          title: 'Helios introduces E7 electric sedan',
          canonicalUrl: 'https://cars.example.com/helios-e7-b',
          publisherName: 'Car Daily',
          publishedAt: at('2026-08-31T15:00:00.000Z', 7),
        },
        {
          id: 'order-c',
          title: 'Helios Motors reports quarterly vehicle deliveries',
          canonicalUrl: 'https://cars.example.com/helios-deliveries',
          publisherName: 'Market Wire',
          publishedAt: at('2026-08-31T15:00:00.000Z', 15),
        },
        {
          id: 'order-d',
          title: 'New Helios E7 sedan revealed at company event',
          canonicalUrl: 'https://cars.example.com/helios-e7-d',
          publisherName: 'Road Journal',
          publishedAt: at('2026-08-31T15:00:00.000Z', 22),
        },
      ],

      expectedClusters: [
        {
          clusterId: 'helios-e7',
          articleIds: ['order-a', 'order-b', 'order-d'],
        },
        {
          clusterId: 'helios-deliveries',
          articleIds: ['order-c'],
        },
      ],

      processingSequences: [
        {
          id: 'original',
          articleIds: ['order-a', 'order-b', 'order-c', 'order-d'],
        },
        {
          id: 'reordered',
          articleIds: ['order-d', 'order-c', 'order-b', 'order-a'],
        },
        {
          id: 'mixed',
          articleIds: ['order-c', 'order-a', 'order-d', 'order-b'],
        },
      ],
    },

    {
      id: 'incremental-replay',

      description:
        'Incremental arrival and replay must converge on one stable membership per article.',

      tags: ['incremental-replay', 'multi-article', 'clear-same-story', 'clear-different-story'],

      articles: [
        {
          id: 'incremental-a',
          title: 'Redwood Systems announces QuantumDB 3',
          canonicalUrl: 'https://database.example.com/quantumdb-3-a',
          publisherName: 'Database Wire',
          publishedAt: at('2026-08-31T16:00:00.000Z', 0),
        },
        {
          id: 'incremental-b',
          title: 'Redwood launches version 3 of QuantumDB',
          canonicalUrl: 'https://database.example.com/quantumdb-3-b',
          publisherName: 'Developer Daily',
          publishedAt: at('2026-08-31T16:00:00.000Z', 11),
        },
        {
          id: 'incremental-c',
          title: 'Redwood Systems opens new Seattle engineering office',
          canonicalUrl: 'https://business.example.com/redwood-seattle',
          publisherName: 'Business Daily',
          publishedAt: at('2026-08-31T16:00:00.000Z', 35),
        },
      ],

      expectedClusters: [
        {
          clusterId: 'quantumdb-3',
          articleIds: ['incremental-a', 'incremental-b'],
        },
        {
          clusterId: 'redwood-seattle-office',
          articleIds: ['incremental-c'],
        },
      ],

      processingSequences: [
        {
          id: 'incremental-with-replay',
          articleIds: ['incremental-a', 'incremental-b', 'incremental-b', 'incremental-c'],
        },
      ],
    },
  ],
};
