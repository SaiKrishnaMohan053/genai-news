import type { Phase1ValidationExpectation } from './contracts.js';

export const phase1ValidationMatrix: readonly Phase1ValidationExpectation[] = [
  {
    scenario: 'successful-discovery',

    expectedOutcome: 'success',

    expectsRetry: false,

    expectsPersistence: true,

    expectsDuplicatePersistence: false,

    expectedStructuredEvent: 'news.discovery.completed',
  },

  {
    scenario: 'source-network-failure',

    expectedOutcome: 'retriable-failure',

    expectsRetry: true,

    expectsPersistence: false,

    expectsDuplicatePersistence: false,

    expectedStructuredEvent: 'news.discovery.failed',
  },

  {
    scenario: 'source-http-retriable',

    expectedOutcome: 'retriable-failure',

    expectsRetry: true,

    expectsPersistence: false,

    expectsDuplicatePersistence: false,

    expectedStructuredEvent: 'news.discovery.failed',
  },

  {
    scenario: 'source-http-terminal',

    expectedOutcome: 'terminal-failure',

    expectsRetry: false,

    expectsPersistence: false,

    expectsDuplicatePersistence: false,

    expectedStructuredEvent: 'news.discovery.failed',
  },

  {
    scenario: 'source-invalid-payload',

    expectedOutcome: 'terminal-failure',

    expectsRetry: false,

    expectsPersistence: false,

    expectsDuplicatePersistence: false,

    expectedStructuredEvent: 'news.discovery.failed',
  },

  {
    scenario: 'queue-unavailable',

    expectedOutcome: 'terminal-failure',

    expectsRetry: false,

    expectsPersistence: false,

    expectsDuplicatePersistence: false,

    expectedStructuredEvent: 'news.discovery.enqueue_failed',
  },

  {
    scenario: 'persistence-failure',

    expectedOutcome: 'retriable-failure',

    expectsRetry: true,

    expectsPersistence: false,

    expectsDuplicatePersistence: false,

    expectedStructuredEvent: 'news.discovery.failed',
  },

  {
    scenario: 'worker-retry',

    expectedOutcome: 'success',

    expectsRetry: true,

    expectsPersistence: true,

    expectsDuplicatePersistence: false,

    expectedStructuredEvent: 'news.discovery.completed',
  },

  {
    scenario: 'replayed-job',

    expectedOutcome: 'success',

    expectsRetry: false,

    expectsPersistence: true,

    expectsDuplicatePersistence: false,

    expectedStructuredEvent: 'news.discovery.completed',
  },

  {
    scenario: 'repeated-discovery',

    expectedOutcome: 'success',

    expectsRetry: false,

    expectsPersistence: true,

    expectsDuplicatePersistence: false,

    expectedStructuredEvent: 'news.discovery.completed',
  },
];
