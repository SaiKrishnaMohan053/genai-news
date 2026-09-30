import {
  createResearchStructuredOutputModel,
  createResearchToolCallingModel,
  createResearchTools,
  type ResearchStructuredOutputModel,
  type ResearchToolCallingModel,
  type ResearchToolPorts,
} from '@genai-news/agents';

import type { StoryRepository, StoryDetail } from '@genai-news/database';

import {
  createFetchArticleCapability,
  createNewsSearchCapability,
  createOfficialSourceSearchCapability,
  createRelatedSourceSearchCapability,
  type ResearchSearchProvider,
} from '@genai-news/tools';

import type {
  ResearchContext,
  ResearchSource,
  ResearchSourceCatalog,
  ResearchToolExecution,
} from '@genai-news/shared';

import type { ResearchExecutionInput } from '../jobs/research.js';

import type { ResearchRunnerRuntime } from './research-executor.js';

export type ResearchRuntimeModelFactory = Readonly<{
  createToolCallingModel(tools: ReturnType<typeof createResearchTools>): ResearchToolCallingModel;

  createStructuredOutputModel(): ResearchStructuredOutputModel;
}>;

export type CreateResearchRuntimeFactoryOptions = {
  storyRepository: StoryRepository;

  searchProvider: ResearchSearchProvider;

  models: ResearchRuntimeModelFactory;

  now?: () => Date;
};

export function createResearchRuntimeFactory(options: CreateResearchRuntimeFactoryOptions) {
  return async function createRuntime(
    input: ResearchExecutionInput,
  ): Promise<ResearchRunnerRuntime> {
    const story = await options.storyRepository.findDetailById(input.storyId);

    if (story === null) {
      throw new Error(`Cannot create research runtime for missing story: ${input.storyId}`);
    }

    if (story.memberships.length === 0) {
      throw new Error(`Research story has no article memberships: ${input.storyId}`);
    }

    const now = options.now ?? (() => new Date());

    const capturedAt = now();

    const context = createResearchContext(input, story, capturedAt);

    const catalog = createInitialCatalog(input.researchRunId, story, capturedAt);

    const sourcesById = new Map(catalog.sources.map((source) => [source.sourceId, source]));

    const canonicalUrlToSourceId = new Map(
      catalog.sources.map((source) => [source.canonicalUrl, source.sourceId]),
    );

    async function registerObservedSources(registration: {
      candidates: readonly {
        url: string;
        canonicalUrl: string;
        title: string | null;
        publisherName: string | null;
        publishedAt: Date | null;
        excerpt: string | null;
      }[];

      execution: ResearchToolExecution;
    }): Promise<readonly ResearchSource[]> {
      const registered: ResearchSource[] = [];

      for (let index = 0; index < registration.candidates.length; index += 1) {
        const candidate = registration.candidates[index];

        if (candidate === undefined) {
          continue;
        }

        const existingId = canonicalUrlToSourceId.get(candidate.canonicalUrl);

        if (existingId !== undefined) {
          const existing = sourcesById.get(existingId);

          if (existing === undefined) {
            throw new Error('Research source catalog index is inconsistent.');
          }

          registered.push(existing);

          continue;
        }

        const sourceId = createToolSourceId(registration.execution, index);

        if (sourcesById.has(sourceId)) {
          throw new Error(`Research source id collision: ${sourceId}`);
        }

        const source: ResearchSource = {
          sourceId,

          url: candidate.url,

          canonicalUrl: candidate.canonicalUrl,

          title: candidate.title,

          publisherName: candidate.publisherName,

          publishedAt: candidate.publishedAt,

          observedAt: now(),

          provenance: [
            {
              kind: 'tool-result',

              toolCallId: registration.execution.toolCallId,

              toolName: registration.execution.toolName,
            },
          ],
        };

        sourcesById.set(source.sourceId, source);

        canonicalUrlToSourceId.set(source.canonicalUrl, source.sourceId);

        registered.push(source);
      }

      return registered;
    }

    const fetchArticle = createFetchArticleCapability({
      getSource: (sourceId) => sourcesById.get(sourceId),
    });

    const searchNews = createNewsSearchCapability({
      search: options.searchProvider,

      registerObservedSources,
    });

    const searchOfficialSource = createOfficialSourceSearchCapability({
      search: options.searchProvider,

      registerObservedSources,
    });

    const findRelatedSources = createRelatedSourceSearchCapability({
      search: options.searchProvider,

      registerObservedSources,

      getKnownCanonicalUrls: () => [...canonicalUrlToSourceId.keys()],
    });

    const toolPorts: ResearchToolPorts = {
      hasSource: (sourceId) => sourcesById.has(sourceId),

      searchNews,

      fetchArticle,

      searchOfficialSource,

      findRelatedSources,
    };

    const tools = createResearchTools(
      {
        researchRunId: input.researchRunId,

        storyId: input.storyId,
      },

      toolPorts,
    );

    return {
      context,

      getCatalog: () => ({
        researchRunId: input.researchRunId,

        storyId: input.storyId,

        sources: [...sourcesById.values()],
      }),

      toolPorts,

      toolCallingModel: options.models.createToolCallingModel(tools),

      structuredOutputModel: options.models.createStructuredOutputModel(),
    };
  };
}

function createResearchContext(
  input: ResearchExecutionInput,
  story: StoryDetail,
  capturedAt: Date,
): ResearchContext {
  return {
    researchRunId: input.researchRunId,

    request: {
      storyId: input.storyId,

      ...(input.researchGoal === null
        ? {}
        : {
            researchGoal: input.researchGoal,
          }),
    },

    story: {
      id: story.id,

      canonicalTitle: story.canonicalTitle,

      firstPublishedAt: story.firstPublishedAt,

      lastPublishedAt: story.lastPublishedAt,
    },

    capturedAt,

    existingArticleIds: story.memberships.map((membership) => membership.article.id),
  };
}

function createInitialCatalog(
  researchRunId: string,
  story: StoryDetail,
  observedAt: Date,
): ResearchSourceCatalog {
  return {
    researchRunId,

    storyId: story.id,

    sources: story.memberships.map((membership) => ({
      sourceId: createStorySourceId(membership.article.id),

      url: membership.article.url,

      canonicalUrl: membership.article.canonicalUrl,

      title: membership.article.title,

      publisherName: membership.article.publisherName,

      publishedAt: membership.article.publishedAt,

      observedAt,

      provenance: [
        {
          kind: 'story-member' as const,

          articleId: membership.article.id,
        },
      ],
    })),
  };
}

function createStorySourceId(articleId: string): string {
  return `story_${articleId}`;
}

function createToolSourceId(execution: ResearchToolExecution, index: number): string {
  return ['tool', execution.toolCallId, String(index)].join('_');
}
