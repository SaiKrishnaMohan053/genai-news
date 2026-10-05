'use client';

import { useCallback, useEffect, useState } from 'react';

type ResearchBudget = {
  maxToolCalls: number;
  maxModelCalls: number;
  timeoutMs: number;
  maxSelectedSources: number;
  maxUnresolvedQuestions: number;
  maxQuestionLength: number;
};

type ResearchSelection = {
  sourceIds: string[];
  primarySourceCandidateIds: string[];
  unresolvedQuestions: string[];
  completionSuggestion: 'coverage-sufficient' | 'coverage-incomplete';
};

type ResearchRun = {
  id: string;
  storyId: string;

  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

  researchGoal: string | null;

  budget: ResearchBudget;

  outcome: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_SOURCES' | 'FAILED' | null;

  stopReason: string | null;

  selection: ResearchSelection | null;

  modelCalls: number;
  toolCalls: number;

  startedAt: string | null;
  completedAt: string | null;

  createdAt: string;
  updatedAt: string;
};

type ResearchRunResponse = {
  researchRun: ResearchRun;
};

type StartResearchResponse = {
  status: 'accepted';

  researchRun: ResearchRun;

  job: {
    id: string;
    name: string;
  };

  replayed: boolean;
};

type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

const inspectionResearchBudget: ResearchBudget = {
  maxToolCalls: 6,
  maxModelCalls: 4,
  timeoutMs: 30_000,
  maxSelectedSources: 5,
  maxUnresolvedQuestions: 3,
  maxQuestionLength: 300,
};

export function ResearchInspectionPanel({ storyId }: { storyId: string }) {
  const [researchRun, setResearchRun] = useState<ResearchRun | null>(null);

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadResearch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/news/stories/${encodeURIComponent(storyId)}/research`, {
        cache: 'no-store',
      });

      const body = (await response.json()) as ResearchRunResponse | ApiErrorResponse;

      if (response.status === 404 && getErrorCode(body) === 'STORY_RESEARCH_NOT_FOUND') {
        setResearchRun(null);

        return;
      }

      if (!response.ok) {
        throw new Error(getErrorMessage(body, 'Failed to load research.'));
      }

      setResearchRun((body as ResearchRunResponse).researchRun);
    } catch (error) {
      setError(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  useEffect(() => {
    void loadResearch();
  }, [loadResearch]);

  async function startResearch() {
    setStarting(true);
    setError(null);

    try {
      const response = await fetch(`/api/news/stories/${encodeURIComponent(storyId)}/research`, {
        method: 'POST',

        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },

        body: JSON.stringify({
          researchGoal: 'Research and corroborate this story using multiple reliable sources.',

          budget: inspectionResearchBudget,
        }),
      });

      const body = (await response.json()) as StartResearchResponse | ApiErrorResponse;

      if (!response.ok) {
        throw new Error(getErrorMessage(body, 'Failed to start research.'));
      }

      setResearchRun((body as StartResearchResponse).researchRun);
    } catch (error) {
      setError(toErrorMessage(error));
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Research agent
          </p>

          <h4 className="mt-1 text-base font-semibold text-slate-900">Research inspection</h4>

          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Start or inspect the latest persisted research run for this canonical story.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadResearch()}
            disabled={loading || starting}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={() => void startResearch()}
            disabled={starting}
            className="inline-flex min-h-9 items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? 'Starting...' : 'Start research'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {loading && researchRun === null ? (
        <p className="mt-5 text-sm text-slate-500">Loading research state...</p>
      ) : researchRun === null ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-white p-4">
          <p className="text-sm font-medium text-slate-800">No research run yet.</p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Start research to enqueue the bounded Research Agent workflow for this story.
          </p>
        </div>
      ) : (
        <ResearchRunView researchRun={researchRun} />
      )}
    </section>
  );
}

function ResearchRunView({ researchRun }: { researchRun: ResearchRun }) {
  return (
    <div className="mt-5 space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">Research run</p>

            <p className="mt-1 break-all text-sm font-medium text-slate-800">{researchRun.id}</p>
          </div>

          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClassName(
              researchRun.status,
            )}`}
          >
            {researchRun.status}
          </span>
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <ResearchMetadata label="Outcome" value={researchRun.outcome ?? '-'} />

          <ResearchMetadata label="Stop reason" value={researchRun.stopReason ?? '-'} />

          <ResearchMetadata label="Model calls" value={String(researchRun.modelCalls)} />

          <ResearchMetadata label="Tool calls" value={String(researchRun.toolCalls)} />

          <ResearchMetadata
            label="Started"
            value={researchRun.startedAt ? formatDate(researchRun.startedAt) : '-'}
          />

          <ResearchMetadata
            label="Completed"
            value={researchRun.completedAt ? formatDate(researchRun.completedAt) : '-'}
          />
        </dl>

        {researchRun.researchGoal ? (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Research goal
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-700">{researchRun.researchGoal}</p>
          </div>
        ) : null}
      </div>

      {researchRun.selection ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h5 className="text-sm font-semibold text-slate-900">Agent selection</h5>

            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {researchRun.selection.completionSuggestion}
            </span>
          </div>

          <ResearchStringList
            label="Selected source IDs"
            values={researchRun.selection.sourceIds}
          />

          <ResearchStringList
            label="Primary source candidates"
            values={researchRun.selection.primarySourceCandidateIds}
          />

          <ResearchStringList
            label="Unresolved questions"
            values={researchRun.selection.unresolvedQuestions}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No agent selection has been persisted yet.
        </div>
      )}
    </div>
  );
}

function ResearchMetadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>

      <dd className="mt-1 break-words text-sm text-slate-700">{value}</dd>
    </div>
  );
}

function ResearchStringList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="mt-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>

      {values.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">None</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {values.map((value) => (
            <li
              key={value}
              className="break-words rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700"
            >
              {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusClassName(status: ResearchRun['status']): string {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-50 text-amber-700';

    case 'RUNNING':
      return 'bg-blue-50 text-blue-700';

    case 'COMPLETED':
      return 'bg-emerald-50 text-emerald-700';

    case 'FAILED':
      return 'bg-red-50 text-red-700';
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getErrorCode(body: ResearchRunResponse | StartResearchResponse | ApiErrorResponse) {
  return 'error' in body ? body.error?.code : undefined;
}

function getErrorMessage(
  body: ResearchRunResponse | StartResearchResponse | ApiErrorResponse,
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
