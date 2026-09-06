import { z } from 'zod';

import { normalizeArticleUrl } from '../normalization/url-normalizer.js';

export const INITIAL_RESEARCH_CONTRACT_VERSION = 'research-contract-v1' as const;

// Identifiers are application-owned. Do not silently rewrite them while parsing.
const identifierSchema = z
  .string()
  .min(1)
  .refine((value) => value === value.trim(), {
    message: 'Identifier must not contain surrounding whitespace.',
  });

const nonBlankTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: 'Text must not be blank.',
});

export const researchRequestSchema = z.strictObject({
  storyId: identifierSchema,
  researchGoal: nonBlankTextSchema.optional(),
});

export type ResearchRequest = z.infer<typeof researchRequestSchema>;

/** Application-loaded snapshot identity, never supplied by the model. */
export const researchContextSchema = z.strictObject({
  researchRunId: identifierSchema,
  request: researchRequestSchema,
  story: z.strictObject({
    id: identifierSchema,
    canonicalTitle: nonBlankTextSchema,
    firstPublishedAt: z.date().nullable(),
    lastPublishedAt: z.date().nullable(),
  }),
  capturedAt: z.date(),
  existingArticleIds: z.array(identifierSchema).min(1),
});

export type ResearchContext = z.infer<typeof researchContextSchema>;

export const RESEARCH_TOOL_NAMES = [
  'search_news',
  'fetch_article',
  'search_official_source',
  'find_related_sources',
] as const;

// This names the intended capability boundary; it does not register any tools.
export const researchSourceProvenanceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('story-member'),
    articleId: identifierSchema,
  }),
  z.strictObject({
    kind: z.literal('tool-result'),
    toolCallId: identifierSchema,
    toolName: z.enum(RESEARCH_TOOL_NAMES),
  }),
]);

export type ResearchSourceProvenance = z.infer<typeof researchSourceProvenanceSchema>;

/**
 * Application-owned source record. Origin and primary-source candidacy are
 * separate: an existing story member may also be a primary-source candidate.
 * observedAt is when this run observed the record, not proof of a page fetch.
 */
export const researchSourceSchema = z
  .strictObject({
    sourceId: identifierSchema,
    url: nonBlankTextSchema,
    canonicalUrl: nonBlankTextSchema,
    title: nonBlankTextSchema.nullable(),
    publisherName: nonBlankTextSchema.nullable(),
    publishedAt: z.date().nullable(),
    observedAt: z.date(),
    provenance: z.array(researchSourceProvenanceSchema).min(1),
  })
  .superRefine((source, context) => {
    const normalized = normalizeArticleUrl(source.url);

    if (normalized === null || normalized.url !== source.url) {
      context.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'Expected normalized HTTP(S) URL.',
      });
    }

    if (normalized === null || normalized.canonicalUrl !== source.canonicalUrl) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalUrl'],
        message: 'Canonical URL mismatch.',
      });
    }
  });

export type ResearchSource = z.infer<typeof researchSourceSchema>;

/** Only application code may populate this catalog from input/tool results. */
export const researchSourceCatalogSchema = z.strictObject({
  researchRunId: identifierSchema,
  storyId: identifierSchema,
  sources: z.array(researchSourceSchema),
});

export type ResearchSourceCatalog = z.infer<typeof researchSourceCatalogSchema>;

/**
 * Model-facing output is references plus research gaps. It cannot supply source
 * facts, run identity, verification verdicts, or the final application status.
 * Keep cross-record refinements outside this schema for structured-output use.
 */
export const researchAgentSelectionSchema = z.strictObject({
  sourceIds: z.array(z.string().min(1)),
  primarySourceCandidateIds: z.array(z.string().min(1)),
  unresolvedQuestions: z.array(z.string().min(1)),
  completionSuggestion: z.enum(['coverage-sufficient', 'coverage-incomplete']),
});

export type ResearchAgentSelection = z.infer<typeof researchAgentSelectionSchema>;

/** No production defaults are selected in the domain-contract subphase. */
export const researchBudgetSchema = z.strictObject({
  maxToolCalls: z.number().int().nonnegative(),
  maxModelCalls: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  maxSelectedSources: z.number().int().positive(),
  maxUnresolvedQuestions: z.number().int().positive(),
  maxQuestionLength: z.number().int().positive(),
});

export type ResearchBudget = z.infer<typeof researchBudgetSchema>;

// Terminal domain outcomes are distinct from queued/running job lifecycle.
export const RESEARCH_OUTCOMES = ['complete', 'partial', 'insufficient-sources', 'failed'] as const;
export type ResearchOutcome = (typeof RESEARCH_OUTCOMES)[number];

export const RESEARCH_STOP_REASONS = [
  'criteria-satisfied',
  'no-useful-results',
  'tool-budget-exhausted',
  'model-budget-exhausted',
  'deadline-exceeded',
  'terminal-failure',
] as const;
export type ResearchStopReason = (typeof RESEARCH_STOP_REASONS)[number];
