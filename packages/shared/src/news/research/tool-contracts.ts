import { z } from 'zod';
import type { RESEARCH_TOOL_NAMES } from './contracts.js';

export const researchSearchInputSchema = z.strictObject({
  query: z.string().min(1).max(200).regex(/\S/),
});

const sourceIdSchema = z.string().min(1).max(256).regex(/^\S+$/);

export const researchFetchInputSchema = z.strictObject({
  sourceId: sourceIdSchema,
});

export type ResearchSearchInput = z.infer<typeof researchSearchInputSchema>;
export type ResearchFetchInput = z.infer<typeof researchFetchInputSchema>;

const retryableByCode = {
  unavailable: true,
  'rate-limited': true,
  'quota-exhausted': false,
  timeout: true,
  'unknown-source': false,
  'blocked-url': false,
  'unsupported-content': false,
  'invalid-result': false,
  'tool-failed': false,
} as const;

export type ResearchToolErrorCode = keyof typeof retryableByCode;

const errorSchema = z
  .strictObject({
    status: z.literal('error'),
    error: z.strictObject({
      code: z.enum([
        'unavailable',
        'rate-limited',
        'quota-exhausted',
        'timeout',
        'unknown-source',
        'blocked-url',
        'unsupported-content',
        'invalid-result',
        'tool-failed',
      ]),
      retryable: z.boolean(),
    }),
  })
  .refine((value) => value.error.retryable === retryableByCode[value.error.code]);

export function createResearchToolError(code: ResearchToolErrorCode) {
  return {
    status: 'error' as const,
    error: {
      code,
      retryable: retryableByCode[code],
    },
  };
}

// A bounded view of sources already registered by application code.
const sourceViewSchema = z.strictObject({
  sourceId: sourceIdSchema,
  title: z.string().min(1).max(500).regex(/\S/).nullable(),
  publisherName: z.string().min(1).max(200).regex(/\S/).nullable(),
  publishedAt: z.iso.datetime().nullable(),
  excerpt: z.string().min(1).max(1000).regex(/\S/).nullable(),
});

export const researchSearchResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ok'),
    sources: z.array(sourceViewSchema).max(10),
    rejectedCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }),
  errorSchema,
]);

export const researchFetchResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ok'),
    sourceId: sourceIdSchema,
    text: z.string().min(1).max(16000).regex(/\S/),
    fetchedAt: z.iso.datetime(),
    truncated: z.boolean(),
  }),
  errorSchema,
]);

export type ResearchSearchResult = z.infer<typeof researchSearchResultSchema>;
export type ResearchFetchResult = z.infer<typeof researchFetchResultSchema>;

// Supplied by the application/runtime, never by the tool's JSON arguments.
export interface ResearchToolExecution {
  readonly researchRunId: string;
  readonly storyId: string;
  readonly toolCallId: string;
  readonly toolName: (typeof RESEARCH_TOOL_NAMES)[number];
  readonly signal?: AbortSignal;
}
