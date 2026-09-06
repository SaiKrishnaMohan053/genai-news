import { describe, expect, it } from 'vitest';

import {
  assertResearchContext,
  assertResearchSourceCatalog,
  researchAgentSelectionSchema,
  researchBudgetSchema,
  researchRequestSchema,
  researchSourceSchema,
  validateResearchAgentSelection,
  type ResearchAgentSelection,
  type ResearchBudget,
  type ResearchContext,
  type ResearchSource,
  type ResearchSourceCatalog,
} from '../src/index.js';

function fixture() {
  const now = new Date('2026-09-06T12:00:00.000Z');

  const context: ResearchContext = {
    researchRunId: 'run-1',
    request: { storyId: 'story-1' },
    story: {
      id: 'story-1',
      canonicalTitle: 'Example organization announces a release',
      firstPublishedAt: null,
      lastPublishedAt: null,
    },
    capturedAt: now,
    existingArticleIds: ['article-1'],
  };

  const member: ResearchSource = {
    sourceId: 'source-1',
    url: 'https://example.com/release?utm_source=rss',
    canonicalUrl: 'https://example.com/release',
    title: 'Release announcement',
    publisherName: 'Example',
    publishedAt: null,
    observedAt: now,
    provenance: [{ kind: 'story-member', articleId: 'article-1' }],
  };

  const additional: ResearchSource = {
    sourceId: 'source-2',
    url: 'https://news.example.org/report',
    canonicalUrl: 'https://news.example.org/report',
    title: null,
    publisherName: null,
    publishedAt: null,
    observedAt: now,
    provenance: [{ kind: 'tool-result', toolCallId: 'call-1', toolName: 'search_news' }],
  };

  const catalog: ResearchSourceCatalog = {
    researchRunId: context.researchRunId,
    storyId: context.story.id,
    sources: [member, additional],
  };

  const selection: ResearchAgentSelection = {
    sourceIds: ['source-1', 'source-2'],
    primarySourceCandidateIds: ['source-1'],
    unresolvedQuestions: [],
    completionSuggestion: 'coverage-sufficient',
  };

  // Test-only budgets, not recommended production defaults.
  const budget: ResearchBudget = {
    maxToolCalls: 4,
    maxModelCalls: 3,
    timeoutMs: 1000,
    maxSelectedSources: 2,
    maxUnresolvedQuestions: 2,
    maxQuestionLength: 100,
  };

  return { context, member, additional, catalog, selection, budget };
}

describe('research domain boundary', () => {
  it('accepts one story and an optional research goal', () => {
    expect(researchRequestSchema.parse({ storyId: 'story-1' })).toEqual({
      storyId: 'story-1',
    });

    expect(
      researchRequestSchema.parse({
        storyId: 'story-1',
        researchGoal: 'Find primary evidence',
      }).researchGoal,
    ).toBe('Find primary evidence');
  });

  it.each([
    { topic: 'AI' },
    { storyId: '' },
    { storyId: ' story-1' },
    { storyId: 'story-1', researchGoal: '  ' },
    { storyId: 'story-1', publish: true },
  ])('rejects unsupported or malformed request %j', (request) => {
    expect(researchRequestSchema.safeParse(request).success).toBe(false);
  });

  it('accepts a canonical story snapshot using the existing story invariant', () => {
    expect(() => assertResearchContext(fixture().context)).not.toThrow();
  });

  it('rejects a different story in the request', () => {
    const { context } = fixture();
    context.request.storyId = 'story-other';

    expect(() => assertResearchContext(context)).toThrow('context story');
  });

  it('rejects invalid story publication order', () => {
    const { context } = fixture();
    context.story.firstPublishedAt = new Date('2026-09-07');
    context.story.lastPublishedAt = new Date('2026-09-06');

    expect(() => assertResearchContext(context)).toThrow('firstPublishedAt');
  });

  it('rejects invalid snapshot dates', () => {
    const { context } = fixture();
    context.capturedAt = new Date('invalid');

    expect(() => assertResearchContext(context)).toThrow();
  });

  it.each([{ ids: [] }, { ids: ['article-1', 'article-1'] }])(
    'rejects empty or duplicate member IDs %j',
    ({ ids }) => {
      const { context } = fixture();
      context.existingArticleIds = ids;

      expect(() => assertResearchContext(context)).toThrow();
    },
  );
});

describe('research source provenance', () => {
  it('accepts existing members and additional tool results', () => {
    const { catalog, context } = fixture();

    expect(() => assertResearchSourceCatalog(catalog, context)).not.toThrow();
  });

  it.each(['researchRunId', 'storyId'] as const)(
    'rejects a catalog with a different %s',
    (field) => {
      const { catalog, context } = fixture();
      catalog[field] = 'other';

      expect(() => assertResearchSourceCatalog(catalog, context)).toThrow(
        'same research run and story',
      );
    },
  );

  it('rejects invented membership provenance', () => {
    const { catalog, context, member } = fixture();
    member.provenance = [{ kind: 'story-member', articleId: 'article-other' }];

    expect(() => assertResearchSourceCatalog(catalog, context)).toThrow('article in the snapshot');
  });

  it('rejects missing provenance', () => {
    const { member } = fixture();

    expect(researchSourceSchema.safeParse({ ...member, provenance: [] }).success).toBe(false);
  });

  it('rejects unallowlisted tool names', () => {
    const { member } = fixture();

    expect(
      researchSourceSchema.safeParse({
        ...member,
        provenance: [
          {
            kind: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'execute_request',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects one tool-call ID attributed to two different tools', () => {
    const { catalog, context, member } = fixture();

    member.provenance.push({
      kind: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'fetch_article',
    });

    expect(() => assertResearchSourceCatalog(catalog, context)).toThrow('different tool names');
  });

  it('allows one tool call to return multiple distinct sources', () => {
    const { catalog, context, member } = fixture();

    member.provenance.push({
      kind: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'search_news',
    });

    expect(() => assertResearchSourceCatalog(catalog, context)).not.toThrow();
  });

  it('rejects duplicate source identifiers', () => {
    const { catalog, context, additional } = fixture();
    additional.sourceId = 'source-1';

    expect(() => assertResearchSourceCatalog(catalog, context)).toThrow(
      'Source IDs must be unique',
    );
  });

  it('rejects duplicate canonical URLs despite different tracking parameters', () => {
    const { catalog, context, additional, member } = fixture();

    additional.url = 'https://example.com/release?utm_source=search';
    additional.canonicalUrl = member.canonicalUrl;

    expect(() => assertResearchSourceCatalog(catalog, context)).toThrow(
      'Canonical URLs must be unique',
    );
  });

  it('rejects a mismatched canonical URL', () => {
    const { member } = fixture();

    expect(
      researchSourceSchema.safeParse({
        ...member,
        canonicalUrl: 'https://other.example/',
      }).success,
    ).toBe(false);
  });

  it.each(['file:///tmp/source', 'https://user:secret@example.com/release', 'not-a-url'])(
    'rejects invalid source URL %s',
    (url) => {
      const { member } = fixture();

      expect(researchSourceSchema.safeParse({ ...member, url }).success).toBe(false);
    },
  );

  it('does not mistake URL syntax validation for network safety validation', () => {
    const { member } = fixture();

    // No fetch occurs here. DNS/private-address/redirect checks belong to fetchArticle.
    expect(
      researchSourceSchema.safeParse({
        ...member,
        url: 'http://127.0.0.1/internal',
        canonicalUrl: 'http://127.0.0.1/internal',
      }).success,
    ).toBe(true);
  });
});

describe('research model output validation', () => {
  it('accepts a primary-source candidate that is also an existing member', () => {
    const { selection, catalog, context, budget } = fixture();

    expect(validateResearchAgentSelection(selection, catalog, context, budget)).toEqual(selection);
  });

  it('rejects an invented source reference', () => {
    const { selection, catalog, context, budget } = fixture();
    selection.sourceIds = ['fabricated-source'];

    expect(() => validateResearchAgentSelection(selection, catalog, context, budget)).toThrow(
      'must exist in the source catalog',
    );
  });

  it('rejects primary-source candidates outside the selected sources', () => {
    const { selection, catalog, context, budget } = fixture();
    selection.sourceIds = ['source-2'];

    expect(() => validateResearchAgentSelection(selection, catalog, context, budget)).toThrow(
      'must be a selected source',
    );
  });

  it.each(['sourceIds', 'primarySourceCandidateIds'] as const)(
    'rejects duplicates in %s',
    (field) => {
      const { selection, catalog, context, budget } = fixture();
      selection[field] = ['source-1', 'source-1'];

      expect(() => validateResearchAgentSelection(selection, catalog, context, budget)).toThrow(
        'unique',
      );
    },
  );

  it.each([
    { urls: ['https://invented.example/'] },
    { sources: [{ title: 'Invented', publisherName: 'Invented' }] },
    { verified: true },
    { truthConfidence: 0.99 },
    { caption: 'Publish this' },
    { chainOfThought: 'Hidden reasoning' },
    { status: 'complete' },
    { storyId: 'story-other' },
  ])('rejects model-owned facts or unsupported output fields %j', (extra) => {
    expect(
      researchAgentSelectionSchema.safeParse({
        ...fixture().selection,
        ...extra,
      }).success,
    ).toBe(false);
  });

  it('supports empty incomplete research without invented sources', () => {
    const { catalog, context, budget } = fixture();

    const selection: ResearchAgentSelection = {
      sourceIds: [],
      primarySourceCandidateIds: [],
      unresolvedQuestions: ['Where is the primary announcement?'],
      completionSuggestion: 'coverage-incomplete',
    };

    expect(validateResearchAgentSelection(selection, catalog, context, budget)).toEqual(selection);
  });

  it('rejects sufficient coverage without sources', () => {
    const { selection, catalog, context, budget } = fixture();

    selection.sourceIds = [];
    selection.primarySourceCandidateIds = [];

    expect(() => validateResearchAgentSelection(selection, catalog, context, budget)).toThrow(
      'at least one selected source',
    );
  });

  it('enforces the selected-source output bound', () => {
    const { selection, catalog, context, budget } = fixture();
    budget.maxSelectedSources = 1;

    expect(() => validateResearchAgentSelection(selection, catalog, context, budget)).toThrow(
      'sources exceed',
    );
  });

  it('enforces the unresolved-question output bound', () => {
    const { selection, catalog, context, budget } = fixture();

    selection.unresolvedQuestions = ['Question one?', 'Question two?', 'Question three?'];

    expect(() => validateResearchAgentSelection(selection, catalog, context, budget)).toThrow(
      'questions exceed',
    );
  });

  it.each(['   ', 'a'.repeat(101)])('rejects blank or oversized questions', (question) => {
    const { selection, catalog, context, budget } = fixture();
    selection.unresolvedQuestions = [question];

    expect(() => validateResearchAgentSelection(selection, catalog, context, budget)).toThrow(
      'length budget',
    );
  });

  it('leaves the application context and catalog unchanged', () => {
    const { selection, catalog, context, budget } = fixture();
    const before = structuredClone({ catalog, context });

    validateResearchAgentSelection(selection, catalog, context, budget);

    expect({ catalog, context }).toEqual(before);
  });

  it('returns a detached parsed selection', () => {
    const { selection, catalog, context, budget } = fixture();

    const result = validateResearchAgentSelection(selection, catalog, context, budget);

    result.sourceIds.pop();

    expect(selection.sourceIds).toHaveLength(2);
  });
});

describe('research budget contracts', () => {
  it('permits zero tools when existing coverage suffices', () => {
    expect(
      researchBudgetSchema.safeParse({
        ...fixture().budget,
        maxToolCalls: 0,
      }).success,
    ).toBe(true);
  });

  it.each([
    { maxToolCalls: -1 },
    { maxModelCalls: 0 },
    { timeoutMs: 0 },
    { maxToolCalls: 1.5 },
    { timeoutMs: Infinity },
    { maxModelCalls: NaN },
    { maxSelectedSources: 0 },
    { maxUnresolvedQuestions: 0 },
    { maxQuestionLength: 0 },
  ])('rejects invalid configured budgets %j', (override) => {
    expect(
      researchBudgetSchema.safeParse({
        ...fixture().budget,
        ...override,
      }).success,
    ).toBe(false);
  });
});
