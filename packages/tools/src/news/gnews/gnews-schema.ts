import { z } from 'zod';

export const gnewsArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  url: z.string(),
  image: z.string().nullable().optional(),
  publishedAt: z.string(),
  lang: z.string().optional(),

  source: z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    country: z.string().optional(),
  }),
});

export const gnewsTopHeadlinesResponseSchema = z.object({
  totalArticles: z.number().int().nonnegative(),
  articles: z.array(gnewsArticleSchema),
});

export type GNewsArticle = z.infer<typeof gnewsArticleSchema>;

export type GNewsTopHeadlinesResponse = z.infer<typeof gnewsTopHeadlinesResponseSchema>;
