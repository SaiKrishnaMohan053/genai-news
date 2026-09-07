import { describe, expect, it, vi } from 'vitest';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { isToolMessage } from '@langchain/core/messages';
import {
  RESEARCH_TOOL_NAMES,
  createResearchToolError,
  type ResearchFetchResult,
  type ResearchSearchResult,
} from '@genai-news/shared';
import { createResearchTools, type ResearchToolPorts } from '../src/research/tools.js';

const scope = {
  researchRunId: 'run-1',
  storyId: 'story-1',
};

const source = {
  sourceId: 'source-1',
  title: 'An announcement',
  publisherName: 'Example',
  publishedAt: null,
  excerpt: 'A short excerpt.',
};

function fixture() {
  const known = new Set(['source-1']);

  const searchResult: ResearchSearchResult = {
    status: 'ok',
    sources: [source],
    rejectedCount: 0,
    truncated: false,
  };

  const fetchResult: ResearchFetchResult = {
    status: 'ok',
    sourceId: 'source-1',
    text: 'Retrieved article text.',
    fetchedAt: '2026-09-07T12:00:00.000Z',
    truncated: false,
  };

  const ports = {
    hasSource: (id: string) => known.has(id),
    searchNews: vi.fn<ResearchToolPorts['searchNews']>().mockResolvedValue(searchResult),
    searchOfficialSource: vi
      .fn<ResearchToolPorts['searchOfficialSource']>()
      .mockResolvedValue(searchResult),
    findRelatedSources: vi
      .fn<ResearchToolPorts['findRelatedSources']>()
      .mockResolvedValue(searchResult),
    fetchArticle: vi.fn<ResearchToolPorts['fetchArticle']>().mockResolvedValue(fetchResult),
  };

  const tools = createResearchTools(scope, ports);

  async function invoke(name: keyof typeof tools, args: Record<string, unknown>) {
    const call = {
      type: 'tool_call' as const,
      name,
      id: 'call-1',
      args,
    };

    const message =
      name === 'fetch_article'
        ? await tools.fetch_article.invoke(call)
        : await tools[name].invoke(call);

    if (!isToolMessage(message) || typeof message.content !== 'string') {
      throw new Error('Expected a JSON ToolMessage');
    }

    expect(message.tool_call_id).toBe('call-1');

    return JSON.parse(message.content) as unknown;
  }

  return {
    ports,
    tools,
    invoke,
    searchResult,
    fetchResult,
    known,
  };
}

describe('research tool wrappers', () => {
  it('registers exactly the four domain tool names without invoking capabilities', () => {
    const { tools, ports } = fixture();

    expect(Object.keys(tools)).toEqual([...RESEARCH_TOOL_NAMES]);
    expect(ports.searchNews).not.toHaveBeenCalled();
    expect(ports.fetchArticle).not.toHaveBeenCalled();
  });

  it.each([
    ['search_news', 'searchNews'],
    ['search_official_source', 'searchOfficialSource'],
    ['find_related_sources', 'findRelatedSources'],
  ] as const)('dispatches %s with application-owned execution metadata', async (name, method) => {
    const { invoke, ports, searchResult } = fixture();

    expect(await invoke(name, { query: 'AI announcement' })).toEqual(searchResult);

    expect(ports[method]).toHaveBeenCalledExactlyOnceWith(
      { query: 'AI announcement' },
      {
        ...scope,
        toolCallId: 'call-1',
        toolName: name,
      },
    );
  });

  it.each([
    { query: '' },
    { query: '   ' },
    { query: 'x'.repeat(201) },
    { query: 'AI', limit: 100 },
    { query: 'AI', storyId: 'other-story' },
    { query: 'AI', researchRunId: 'other-run' },
  ])('rejects invalid or extra search arguments before dispatch: %j', async (args) => {
    const { invoke, ports } = fixture();

    await expect(invoke('search_news', args)).rejects.toThrow();
    expect(ports.searchNews).not.toHaveBeenCalled();
  });

  it('rejects arbitrary URLs in fetch arguments before dispatch', async () => {
    const { invoke, ports } = fixture();

    await expect(
      invoke('fetch_article', {
        sourceId: 'source-1',
        url: 'https://example.com',
      }),
    ).rejects.toThrow();

    expect(ports.fetchArticle).not.toHaveBeenCalled();
  });

  it('rejects unknown source references without fetching', async () => {
    const { invoke, ports } = fixture();

    expect(await invoke('fetch_article', { sourceId: 'source-unknown' })).toEqual(
      createResearchToolError('unknown-source'),
    );

    expect(ports.fetchArticle).not.toHaveBeenCalled();
  });

  it('fetches a known source and keeps explicit truncation metadata', async () => {
    const { invoke, ports, fetchResult } = fixture();
    const result = { ...fetchResult, truncated: true };

    ports.fetchArticle.mockResolvedValue(result);

    expect(await invoke('fetch_article', { sourceId: 'source-1' })).toEqual(result);
  });

  it('keeps empty search success distinct from failure', async () => {
    const { invoke, ports } = fixture();

    const result: ResearchSearchResult = {
      status: 'ok',
      sources: [],
      rejectedCount: 2,
      truncated: false,
    };

    ports.searchNews.mockResolvedValue(result);

    expect(await invoke('search_news', { query: 'AI' })).toEqual(result);
  });

  it('rejects unregistered sources in capability output', async () => {
    const { invoke, known } = fixture();

    known.clear();

    expect(await invoke('search_news', { query: 'AI' })).toEqual(
      createResearchToolError('invalid-result'),
    );
  });

  it('rejects duplicate source IDs in a search result', async () => {
    const { invoke, ports, searchResult } = fixture();

    ports.searchNews.mockResolvedValue({
      ...searchResult,
      sources: [source, source],
    });

    expect(await invoke('search_news', { query: 'AI' })).toEqual(
      createResearchToolError('invalid-result'),
    );
  });

  it('rejects a fetch result for a different known source', async () => {
    const { invoke, ports, fetchResult, known } = fixture();

    known.add('source-2');

    ports.fetchArticle.mockResolvedValue({
      ...fetchResult,
      sourceId: 'source-2',
    });

    expect(await invoke('fetch_article', { sourceId: 'source-1' })).toEqual(
      createResearchToolError('invalid-result'),
    );
  });

  it('rejects oversized article output instead of silently truncating it', async () => {
    const { invoke, ports, fetchResult } = fixture();

    ports.fetchArticle.mockResolvedValue({
      ...fetchResult,
      text: 'x'.repeat(16001),
    });

    expect(await invoke('fetch_article', { sourceId: 'source-1' })).toEqual(
      createResearchToolError('invalid-result'),
    );
  });

  it('preserves safe quota errors without retrying', async () => {
    const { invoke, ports } = fixture();

    ports.searchNews.mockResolvedValue(createResearchToolError('quota-exhausted'));

    expect(await invoke('search_news', { query: 'AI' })).toEqual(
      createResearchToolError('quota-exhausted'),
    );

    expect(ports.searchNews).toHaveBeenCalledTimes(1);
  });

  it('does not expose unexpected exception messages', async () => {
    const { invoke, ports } = fixture();

    ports.searchNews.mockRejectedValue(new Error('secret-api-key and private stack'));

    expect(await invoke('search_news', { query: 'AI' })).toEqual(
      createResearchToolError('tool-failed'),
    );
  });

  it('exports strict OpenAI tool schemas with only model-owned arguments', () => {
    const { tools } = fixture();

    for (const [name, instance] of Object.entries(tools)) {
      const definition = convertToOpenAITool(instance, {
        strict: true,
      });

      expect(definition.function).toMatchObject({ strict: true });

      expect(definition.function.parameters).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: [name === 'fetch_article' ? 'sourceId' : 'query'],
      });
    }
  });

  it('rejects unexpected fields in a capability response', async () => {
    const { invoke, ports, searchResult } = fixture();

    const invalid = {
      ...searchResult,
      debug: 'private-value',
    };

    ports.searchNews.mockResolvedValue(invalid);

    expect(await invoke('search_news', { query: 'AI' })).toEqual(
      createResearchToolError('invalid-result'),
    );
  });

  it('rejects inconsistent retryability from a capability', async () => {
    const { invoke, ports } = fixture();

    ports.searchNews.mockResolvedValue({
      status: 'error',
      error: {
        code: 'quota-exhausted',
        retryable: true,
      },
    });

    expect(await invoke('search_news', { query: 'AI' })).toEqual(
      createResearchToolError('invalid-result'),
    );
  });

  it('requires matching tool-call metadata', async () => {
    const { tools, ports } = fixture();

    await expect(tools.search_news.invoke({ query: 'AI' })).rejects.toThrow(
      'matching tool-call metadata',
    );

    expect(ports.searchNews).not.toHaveBeenCalled();
  });

  it('propagates cancellation to the capability and rejects the invocation', async () => {
    const { tools, ports } = fixture();
    const controller = new AbortController();

    ports.searchNews.mockImplementation(async (_input, execution) => {
      expect(execution.signal).toBe(controller.signal);

      controller.abort(new Error('cancelled'));
      execution.signal?.throwIfAborted();

      throw new Error('unreachable');
    });

    await expect(
      tools.search_news.invoke(
        {
          type: 'tool_call',
          name: 'search_news',
          id: 'call-1',
          args: { query: 'AI' },
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow();

    expect(ports.searchNews).toHaveBeenCalledTimes(1);
  });
});
