import { z } from 'zod';

import { NEWS_SOURCE_TYPES } from './source-article.js';

export const newsSourceTypeSchema = z.enum(NEWS_SOURCE_TYPES);

export const newsSourceDescriptorSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: newsSourceTypeSchema,
});

export const articlePublisherSchema = z.object({
  name: z.string().trim().min(1),
  id: z.string().trim().min(1).optional(),
});

/**
 * Structural validation for provider-neutral source data.
 *
 * URL/date semantics are deliberately not enforced here. Those belong to
 * article normalization so malformed external values can be classified and
 * measured rather than disappearing at the adapter boundary.
 */
export const sourceArticleSchema = z.object({
  externalId: z.string().optional(),

  title: z.string().optional(),
  url: z.string().optional(),
  publishedAt: z.string().optional(),

  author: z.string().optional(),
  summary: z.string().optional(),
  category: z.string().optional(),

  publisher: articlePublisherSchema.optional(),

  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const newsSourceFetchInputSchema = z.object({
  limit: z.number().int().positive(),
});
