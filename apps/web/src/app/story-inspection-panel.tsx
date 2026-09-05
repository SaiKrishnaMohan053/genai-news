'use client';

import { useCallback, useEffect, useState } from 'react';

type StoryListItem = {
  id: string;

  canonicalTitle: string;

  seedArticleId: string;
  representativeArticleId: string;

  clusteringVersion: string;

  firstPublishedAt: string | null;
  lastPublishedAt: string | null;

  membershipCount: number;

  createdAt: string;
  updatedAt: string;
};

type StoryListResponse = {
  stories: StoryListItem[];
};

type StoryMembership = {
  id: string;

  kind: 'SEED' | 'MATCHED';

  score: number | null;

  signals: unknown;

  reason: string | null;

  matchedAgainstArticleId: string | null;

  clusteringVersion: string;

  createdAt: string;

  article: {
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
  };
};

type StoryDetail = {
  id: string;

  canonicalTitle: string;

  seedArticleId: string;
  representativeArticleId: string;

  clusteringVersion: string;

  firstPublishedAt: string | null;
  lastPublishedAt: string | null;

  createdAt: string;
  updatedAt: string;

  memberships: StoryMembership[];
};

type StoryDetailResponse = {
  story: StoryDetail;
};

type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

export function StoryInspectionPanel() {
  const [stories, setStories] = useState<StoryListItem[]>([]);

  const [selectedStory, setSelectedStory] = useState<StoryDetail | null>(null);

  const [loadingStories, setLoadingStories] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    setLoadingStories(true);
    setError(null);

    try {
      const nextStories = await fetchStories();

      setStories(nextStories);
    } catch (error) {
      setError(toErrorMessage(error));
    } finally {
      setLoadingStories(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialStories() {
      try {
        const nextStories = await fetchStories();

        if (!cancelled) {
          setStories(nextStories);
        }
      } catch (error) {
        if (!cancelled) {
          setError(toErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoadingStories(false);
        }
      }
    }

    void loadInitialStories();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadStoryDetail(storyId: string) {
    setLoadingDetail(true);
    setError(null);

    try {
      const response = await fetch(`/api/news/stories/${encodeURIComponent(storyId)}`, {
        cache: 'no-store',
      });

      const body = (await response.json()) as StoryDetailResponse | ApiErrorResponse;

      if (!response.ok) {
        throw new Error(getErrorMessage(body, 'Failed to load story detail.'));
      }

      setSelectedStory((body as StoryDetailResponse).story);
    } catch (error) {
      setError(toErrorMessage(error));
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Story inspection</p>

          <h2 className="mt-1 text-xl font-semibold text-slate-900">Canonical stories</h2>

          <p className="mt-2 text-sm text-slate-600">
            Inspect story clusters and their persisted article memberships.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadStories()}
          disabled={loadingStories}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingStories ? 'Refreshing...' : 'Refresh stories'}
        </button>
      </div>

      {error ? (
        <div className="border-b border-slate-200 bg-red-50 px-6 py-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loadingStories && stories.length === 0 ? (
        <div className="p-8 text-sm text-slate-500">Loading persisted stories...</div>
      ) : stories.length === 0 ? (
        <div className="p-8">
          <p className="font-medium text-slate-900">No stories persisted yet.</p>

          <p className="mt-2 text-sm text-slate-600">
            Run discovery, wait for clustering, then refresh this section.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="divide-y divide-slate-200 border-r border-slate-200">
            {stories.map((story) => {
              const selected = selectedStory?.id === story.id;

              return (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => void loadStoryDetail(story.id)}
                  className={`block w-full px-6 py-5 text-left transition ${
                    selected ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold leading-6 text-slate-900">
                        {story.canonicalTitle}
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        {story.membershipCount} article
                        {story.membershipCount === 1 ? '' : 's'}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {story.clusteringVersion}
                    </span>
                  </div>

                  <div className="mt-3 text-xs text-slate-400">
                    {formatStoryWindow(story.firstPublishedAt, story.lastPublishedAt)}
                  </div>

                  <div className="mt-2 truncate text-xs text-slate-400">{story.id}</div>
                </button>
              );
            })}
          </div>

          <div className="min-h-80">
            {loadingDetail ? (
              <div className="p-8 text-sm text-slate-500">Loading story detail...</div>
            ) : selectedStory === null ? (
              <div className="p-8">
                <p className="font-medium text-slate-900">Select a story.</p>

                <p className="mt-2 text-sm text-slate-600">
                  Choose a canonical story to inspect its membership provenance.
                </p>
              </div>
            ) : (
              <StoryDetailView story={selectedStory} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function StoryDetailView({ story }: { story: StoryDetail }) {
  return (
    <div className="p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Canonical story
        </p>

        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          {story.canonicalTitle}
        </h3>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <StoryMetadata label="Story ID" value={story.id} />

          <StoryMetadata label="Version" value={story.clusteringVersion} />

          <StoryMetadata label="Seed article" value={story.seedArticleId} />

          <StoryMetadata label="Representative" value={story.representativeArticleId} />
        </dl>
      </div>

      <div className="mt-8">
        <h4 className="text-sm font-semibold text-slate-900">
          Memberships ({story.memberships.length})
        </h4>

        <div className="mt-4 space-y-4">
          {story.memberships.map((membership) => (
            <article key={membership.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2.5 py-1 font-semibold ${
                    membership.kind === 'SEED'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {membership.kind}
                </span>

                {membership.score !== null ? (
                  <span className="text-slate-500">score {membership.score.toFixed(3)}</span>
                ) : null}

                <span className="text-slate-400">
                  {formatDate(membership.article.publishedAt ?? membership.createdAt)}
                </span>
              </div>

              <a
                href={membership.article.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block font-semibold leading-6 text-slate-900 hover:text-blue-700"
              >
                {membership.article.title}
              </a>

              <p className="mt-2 text-xs text-slate-500">
                {membership.article.publisher?.name ?? membership.article.source.name}
              </p>

              {membership.reason ? (
                <p className="mt-3 break-words text-xs leading-5 text-slate-500">
                  {membership.reason}
                </p>
              ) : null}

              {membership.matchedAgainstArticleId ? (
                <p className="mt-2 break-all text-xs text-slate-400">
                  matched against {membership.matchedAgainstArticleId}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoryMetadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>

      <dd className="mt-1 break-all text-sm text-slate-700">{value}</dd>
    </div>
  );
}

async function fetchStories(): Promise<StoryListItem[]> {
  const response = await fetch('/api/news/stories?limit=25', {
    cache: 'no-store',
  });

  const body = (await response.json()) as StoryListResponse | ApiErrorResponse;

  if (!response.ok) {
    throw new Error(getErrorMessage(body, 'Failed to load stories.'));
  }

  return (body as StoryListResponse).stories;
}

function formatStoryWindow(first: string | null, last: string | null): string {
  if (first === null && last === null) {
    return 'Publication time unavailable';
  }

  if (first === last) {
    const value = first ?? last;

    return value === null ? 'Publication time unavailable' : formatDate(value);
  }

  return `${first ? formatDate(first) : 'unknown'} → ${last ? formatDate(last) : 'unknown'}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getErrorMessage(
  body: StoryListResponse | StoryDetailResponse | ApiErrorResponse,
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
