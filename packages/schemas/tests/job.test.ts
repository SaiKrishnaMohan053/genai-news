import { describe, expect, it } from 'vitest';

import {
  jobIdSchema,
  newsDiscoveryJobSchema,
  systemPingJobSchema,
  researchJobSchema,
  type ResearchJobPayload,
} from '../src/index.js';

describe('jobIdSchema', () => {
  it('accepts a valid job id', () => {
    expect(jobIdSchema.parse('job_123-test')).toBe('job_123-test');
  });

  it('rejects an empty job id', () => {
    expect(() => jobIdSchema.parse('')).toThrow();
  });

  it('rejects a job id longer than 128 characters', () => {
    expect(() => jobIdSchema.parse('a'.repeat(129))).toThrow();
  });

  it('rejects characters outside the allowed set', () => {
    expect(() => jobIdSchema.parse('invalid job id')).toThrow();
  });
});

describe('systemPingJobSchema', () => {
  it('accepts a valid payload', () => {
    const payload = {
      message: 'hello',
      requestedAt: '2026-08-27T16:00:00.000Z',
    };

    expect(systemPingJobSchema.parse(payload)).toEqual(payload);
  });

  it('accepts a UTC timestamp', () => {
    expect(
      systemPingJobSchema.parse({
        message: 'hello',
        requestedAt: '2026-08-27T16:00:00.000Z',
      }),
    ).toEqual({
      message: 'hello',
      requestedAt: '2026-08-27T16:00:00.000Z',
    });
  });

  it('rejects an empty message', () => {
    expect(() =>
      systemPingJobSchema.parse({
        message: '',
        requestedAt: '2026-08-27T16:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects a message longer than 200 characters', () => {
    expect(() =>
      systemPingJobSchema.parse({
        message: 'a'.repeat(201),
        requestedAt: '2026-08-27T16:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects an invalid timestamp', () => {
    expect(() =>
      systemPingJobSchema.parse({
        message: 'hello',
        requestedAt: 'invalid',
      }),
    ).toThrow();
  });
});

describe('newsDiscoveryJobSchema', () => {
  it('accepts a valid discovery payload', () => {
    const payload = {
      sourceId: 'gnews',
      limit: 25,
      requestedAt: '2026-08-27T16:00:00.000Z',
    };

    expect(newsDiscoveryJobSchema.parse(payload)).toEqual(payload);
  });

  it('rejects an empty sourceId', () => {
    expect(() =>
      newsDiscoveryJobSchema.parse({
        sourceId: '',
        limit: 25,
        requestedAt: '2026-08-27T16:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects a non-positive limit', () => {
    expect(() =>
      newsDiscoveryJobSchema.parse({
        sourceId: 'gnews',
        limit: 0,
        requestedAt: '2026-08-27T16:00:00.000Z',
      }),
    ).toThrow();

    expect(() =>
      newsDiscoveryJobSchema.parse({
        sourceId: 'gnews',
        limit: -1,
        requestedAt: '2026-08-27T16:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects a limit greater than 100', () => {
    expect(() =>
      newsDiscoveryJobSchema.parse({
        sourceId: 'gnews',
        limit: 101,
        requestedAt: '2026-08-27T16:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects an invalid requestedAt timestamp', () => {
    expect(() =>
      newsDiscoveryJobSchema.parse({
        sourceId: 'gnews',
        limit: 25,
        requestedAt: 'invalid',
      }),
    ).toThrow();
  });
});

describe('researchJobSchema', () => {
  it('accepts a valid research job payload', () => {
    const payload: ResearchJobPayload = {
      researchRunId: 'research-run-123',
      requestedAt: '2026-09-29T22:30:00.000Z',
    };

    expect(researchJobSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a blank research run id', () => {
    expect(() =>
      researchJobSchema.parse({
        researchRunId: '   ',
        requestedAt: '2026-09-29T22:30:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects an invalid requestedAt value', () => {
    expect(() =>
      researchJobSchema.parse({
        researchRunId: 'research-run-123',
        requestedAt: 'not-a-date',
      }),
    ).toThrow();
  });

  it('rejects unexpected payload fields', () => {
    expect(() =>
      researchJobSchema.parse({
        researchRunId: 'research-run-123',
        requestedAt: '2026-09-29T22:30:00.000Z',

        storyId: 'story-should-not-be-here',
      }),
    ).toThrow();
  });

  it('rejects an excessively long research run id', () => {
    expect(() =>
      researchJobSchema.parse({
        researchRunId: 'r'.repeat(201),
        requestedAt: '2026-09-29T22:30:00.000Z',
      }),
    ).toThrow();
  });
});
