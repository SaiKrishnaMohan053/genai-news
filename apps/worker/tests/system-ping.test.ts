import { describe, expect, it } from 'vitest';

import { processSystemPing } from '../src/jobs/system-ping.js';

describe('system ping processor', () => {
  it('processes a valid job payload', () => {
    const result = processSystemPing({
      message: 'hello',
      requestedAt: '2026-08-19T20:00:00.000Z',
    });

    expect(result.processed).toBe(true);
    expect(result.message).toBe('hello');
    expect(result.requestedAt).toBe('2026-08-19T20:00:00.000Z');

    expect(Number.isNaN(Date.parse(result.processedAt))).toBe(false);
  });

  it('rejects invalid payload', () => {
    expect(() =>
      processSystemPing({
        message: '',
        requestedAt: 'invalid',
      }),
    ).toThrow();
  });
});
