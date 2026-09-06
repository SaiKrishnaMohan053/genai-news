import { assertCanonicalStory } from '../story/invariants.js';

import {
  researchAgentSelectionSchema,
  researchBudgetSchema,
  researchContextSchema,
  researchSourceCatalogSchema,
  type ResearchAgentSelection,
  type ResearchBudget,
  type ResearchContext,
  type ResearchSourceCatalog,
} from './contracts.js';

export function assertResearchContext(context: ResearchContext): void {
  researchContextSchema.parse(context);
  assertCanonicalStory(context.story);

  if (context.request.storyId !== context.story.id) {
    throw new Error('Research request must reference the context story.');
  }

  assertUnique(context.existingArticleIds, 'Existing article IDs');
}

export function assertResearchSourceCatalog(
  catalog: ResearchSourceCatalog,
  context: ResearchContext,
): void {
  assertResearchContext(context);
  researchSourceCatalogSchema.parse(catalog);

  if (catalog.researchRunId !== context.researchRunId || catalog.storyId !== context.story.id) {
    throw new Error('Source catalog must belong to the same research run and story.');
  }

  assertUnique(
    catalog.sources.map((source) => source.sourceId),
    'Source IDs',
  );
  assertUnique(
    catalog.sources.map((source) => source.canonicalUrl),
    'Canonical URLs',
  );

  const existingArticleIds = new Set(context.existingArticleIds);
  const toolNamesByCallId = new Map<string, string>();

  for (const source of catalog.sources) {
    for (const origin of source.provenance) {
      if (origin.kind === 'story-member') {
        if (!existingArticleIds.has(origin.articleId)) {
          throw new Error('Story-member provenance must reference an article in the snapshot.');
        }
      } else {
        const previousName = toolNamesByCallId.get(origin.toolCallId);
        if (previousName !== undefined && previousName !== origin.toolName) {
          throw new Error('One tool call cannot have different tool names.');
        }
        toolNamesByCallId.set(origin.toolCallId, origin.toolName);
      }
    }
  }
}

/**
 * Checks model output against an application-owned catalog. Schema validation
 * cannot prove that a tool really ran: the future runtime must create catalog
 * entries exclusively from observed input/tool receipts, never model text.
 * This function performs no selection, deduplication, I/O, or package assembly.
 */
export function validateResearchAgentSelection(
  value: unknown,
  catalog: ResearchSourceCatalog,
  context: ResearchContext,
  budget: ResearchBudget,
): ResearchAgentSelection {
  assertResearchSourceCatalog(catalog, context);
  researchBudgetSchema.parse(budget);
  const selection = researchAgentSelectionSchema.parse(value);

  assertUnique(selection.sourceIds, 'Selected source IDs');
  assertUnique(selection.primarySourceCandidateIds, 'Primary-source candidate IDs');

  if (selection.sourceIds.length > budget.maxSelectedSources) {
    throw new Error('Selected sources exceed the output budget.');
  }
  if (selection.unresolvedQuestions.length > budget.maxUnresolvedQuestions) {
    throw new Error('Unresolved questions exceed the output budget.');
  }

  const knownIds = new Set(catalog.sources.map((source) => source.sourceId));
  for (const sourceId of selection.sourceIds) {
    if (!knownIds.has(sourceId)) {
      throw new Error('Selected source must exist in the source catalog.');
    }
  }

  const selectedIds = new Set(selection.sourceIds);
  for (const sourceId of selection.primarySourceCandidateIds) {
    if (!selectedIds.has(sourceId)) {
      throw new Error('Primary-source candidate must be a selected source.');
    }
  }

  for (const question of selection.unresolvedQuestions) {
    if (question.trim().length === 0 || question.length > budget.maxQuestionLength) {
      throw new Error('Unresolved question must be non-blank and within its length budget.');
    }
  }

  if (selection.completionSuggestion === 'coverage-sufficient' && selectedIds.size === 0) {
    throw new Error('Sufficient coverage requires at least one selected source.');
  }

  return selection;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must be unique.`);
  }
}
