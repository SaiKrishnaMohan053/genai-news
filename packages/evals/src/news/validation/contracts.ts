export const PHASE1_VALIDATION_SCENARIOS = [
  'successful-discovery',
  'source-network-failure',
  'source-http-retriable',
  'source-http-terminal',
  'source-invalid-payload',
  'queue-unavailable',
  'persistence-failure',
  'worker-retry',
  'replayed-job',
  'repeated-discovery',
] as const;

export type Phase1ValidationScenario =
  (typeof PHASE1_VALIDATION_SCENARIOS)[number];

export const PHASE1_VALIDATION_OUTCOMES = [
  'success',
  'partial-success',
  'retriable-failure',
  'terminal-failure',
] as const;

export type Phase1ValidationOutcome =
  (typeof PHASE1_VALIDATION_OUTCOMES)[number];

export type Phase1ValidationExpectation = {
  scenario: Phase1ValidationScenario;
  expectedOutcome: Phase1ValidationOutcome;

  expectsRetry: boolean;

  expectsPersistence: boolean;

  expectsDuplicatePersistence: boolean;

  expectedStructuredEvent?: string;
};

export type Phase1ValidationResult = {
  scenario: Phase1ValidationScenario;

  passed: boolean;

  expected: Phase1ValidationExpectation;

  actual: {
    outcome: Phase1ValidationOutcome;
    retryObserved: boolean;
    persistenceObserved: boolean;
    duplicatePersistenceObserved: boolean;
    structuredEvents: readonly string[];
  };

  failures: readonly string[];
};