'use client';

import { useCallback, useEffect, useState } from 'react';

type DiscoveryResponse = {
  status: 'accepted';

  job: {
    id: string;
    name: string;
  };
};

type Article = {
  id: string;

  title: string;
  url: string;
  canonicalUrl: string;

  source: {
    id: string;
    name: string;
    type: string;
  };

  publisher: {
    id: string | null;
    name: string;
  } | null;

  publishedAt: string | null;
  firstDiscoveredAt: string;
  lastSeenAt: string;

  author: string | null;
  summary: string | null;
  category: string | null;
};

type ArticleListResponse = {
  articles: Article[];
};

type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

export function InspectionPanel() {
  const [articles, setArticles] = useState<Article[]>([]);

  const [loadingArticles, setLoadingArticles] = useState(true);

  const [discovering, setDiscovering] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [job, setJob] = useState<DiscoveryResponse['job'] | null>(null);

  const loadArticles = useCallback(async () => {
    setLoadingArticles(true);
    setError(null);

    try {
      const response = await fetch('/api/news/articles?limit=25', {
        cache: 'no-store',
      });

      const body = (await response.json()) as ArticleListResponse | ApiErrorResponse;

      if (!response.ok) {
        throw new Error(getErrorMessage(body, 'Failed to load articles.'));
      }

      setArticles((body as ArticleListResponse).articles);
    } catch (error) {
      setError(toErrorMessage(error));
    } finally {
      setLoadingArticles(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialArticles() {
      setLoadingArticles(true);
      setError(null);

      try {
        const response = await fetch('/api/news/articles?limit=25', {
          cache: 'no-store',
        });

        const body = (await response.json()) as ArticleListResponse | ApiErrorResponse;

        if (!response.ok) {
          throw new Error(getErrorMessage(body, 'Failed to load articles.'));
        }

        if (!cancelled) {
          setArticles((body as ArticleListResponse).articles);
        }
      } catch (error) {
        if (!cancelled) {
          setError(toErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoadingArticles(false);
        }
      }
    }

    void loadInitialArticles();

    return () => {
      cancelled = true;
    };
  }, []);

  async function triggerDiscovery() {
    setDiscovering(true);
    setError(null);
    setJob(null);

    try {
      const response = await fetch('/api/news/discover', {
        method: 'POST',

        headers: {
          'content-type': 'application/json',
        },

        body: JSON.stringify({
          sourceId: 'gnews',
          limit: 25,
        }),
      });

      const body = (await response.json()) as DiscoveryResponse | ApiErrorResponse;

      if (!response.ok) {
        throw new Error(getErrorMessage(body, 'Failed to start discovery.'));
      }

      setJob((body as DiscoveryResponse).job);
    } catch (error) {
      setError(toErrorMessage(error));
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Discovery</p>

            <h2 className="mt-1 text-xl font-semibold text-slate-900">Trigger GNews ingestion</h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Enqueues a background discovery job. Processing happens in the BullMQ worker.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void triggerDiscovery()}
            disabled={discovering}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {discovering ? 'Enqueueing...' : 'Run discovery'}
          </button>
        </div>

        {job ? (
          <div className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Accepted job <code className="font-semibold">{job.id}</code>
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Persistence inspection</p>

            <h2 className="mt-1 text-xl font-semibold text-slate-900">Latest articles</h2>

            <p className="mt-2 text-sm text-slate-600">Showing up to 25 persisted articles.</p>
          </div>

          <button
            type="button"
            onClick={() => void loadArticles()}
            disabled={loadingArticles}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingArticles ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loadingArticles && articles.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">Loading persisted articles...</div>
        ) : articles.length === 0 ? (
          <div className="p-8">
            <p className="font-medium text-slate-900">No articles persisted yet.</p>

            <p className="mt-2 text-sm text-slate-600">
              Trigger discovery, wait for the background worker, then refresh.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {articles.map((article) => (
              <article key={article.id} className="p-6">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{article.publisher?.name ?? article.source.name}</span>

                  {article.category ? (
                    <>
                      <span>•</span>
                      <span>{article.category}</span>
                    </>
                  ) : null}

                  <span>•</span>

                  <span>{formatDate(article.publishedAt ?? article.lastSeenAt)}</span>
                </div>

                <a
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block text-lg font-semibold leading-7 text-slate-900 hover:text-blue-700"
                >
                  {article.title}
                </a>

                {article.summary ? (
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
                    {article.summary}
                  </p>
                ) : null}

                <div className="mt-4 break-all text-xs text-slate-400">{article.canonicalUrl}</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getErrorMessage(
  body: ArticleListResponse | DiscoveryResponse | ApiErrorResponse,
  fallback: string,
): string {
  if ('error' in body && body.error?.message) {
    return body.error.message;
  }

  return fallback;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.';
}
