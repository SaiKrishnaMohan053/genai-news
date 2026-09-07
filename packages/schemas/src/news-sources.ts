import { URL } from 'node:url';

import { z } from 'zod';

const rssSourceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._-]*$/)
  .refine((value) => value !== 'gnews', {
    message: 'RSS source id "gnews" is reserved.',
  });

const rssFeedUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => {
      const url = new URL(value);

      return (
        (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
      );
    },
    {
      message: 'RSS feed URL must use HTTP or HTTPS and must not contain credentials.',
    },
  );

export const rssSourceConfigSchema = z.object({
  id: rssSourceIdSchema,
  name: z.string().trim().min(1).max(200),
  feedUrl: rssFeedUrlSchema,
});

export const rssSourceConfigsSchema = z
  .array(rssSourceConfigSchema)
  .superRefine((sources, context) => {
    const seen = new Set<string>();

    sources.forEach((source, index) => {
      if (seen.has(source.id)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: `Duplicate RSS source id: ${source.id}`,
        });
      }

      seen.add(source.id);
    });
  });

export const rssSourceConfigsJsonSchema = z
  .string()
  .default('[]')
  .transform((value, context): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'NEWS_RSS_SOURCES_JSON must contain valid JSON.',
      });

      return z.NEVER;
    }
  })
  .pipe(rssSourceConfigsSchema);

export type RssSourceConfig = z.infer<typeof rssSourceConfigSchema>;
