import { describe, expect, it } from 'vitest';

import { jobIdSchema, systemPingJobSchema } from '../src/index.js';

describe('jobIdSchema', () => {
  it('accepts a valid job id', () => {
    expect(jobIdSchema.parse('phase0-10_job-123')).toBe('phase0-10_job-123');
  });

  it('rejects an empty job id', () => {
    expect(() => jobIdSchema.parse('')).toThrow();
  });

  it('rejects a job id longer than 128 characters', () => {
    expect(() => jobIdSchema.parse('a'.repeat(129))).toThrow();
  });

  it('rejects characters outside the allowed set', () => {
    expect(() => jobIdSchema.parse('job:123')).toThrow();

    expect(() => jobIdSchema.parse('job 123')).toThrow();
  });
});

describe('systemPingJobSchema', () => {
  it('accepts a valid payload', () => {
    const payload = {
      message: 'phase 0.10 schema test',
      requestedAt: '2026-08-21T10:00:00.000-05:00',
    };

    expect(systemPingJobSchema.parse(payload)).toEqual(payload);
  });

  it('accepts a UTC timestamp', () => {
    const payload = {
      message: 'hello',
      requestedAt: '2026-08-21T15:00:00.000Z',
    };

    expect(systemPingJobSchema.parse(payload)).toEqual(payload);
  });

  it('rejects an empty message', () => {
    expect(() =>
      systemPingJobSchema.parse({
        message: '',
        requestedAt: '2026-08-21T15:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects a message longer than 200 characters', () => {
    expect(() =>
      systemPingJobSchema.parse({
        message: 'a'.repeat(201),
        requestedAt: '2026-08-21T15:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects an invalid timestamp', () => {
    expect(() =>
      systemPingJobSchema.parse({
        message: 'hello',
        requestedAt: 'not-a-date',
      }),
    ).toThrow();
  });
});
