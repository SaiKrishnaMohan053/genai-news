import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/logger.js';

function createCapturedLogger() {
  const stream = new PassThrough();

  let output = '';

  stream.on('data', (chunk) => {
    output += chunk.toString();
  });

  const logger = createLogger({
    service: 'test-service',
    environment: 'test',
    level: 'info',
    destination: stream,
  });

  return {
    logger,
    getEntry() {
      return JSON.parse(output.trim()) as Record<string, unknown>;
    },
  };
}

describe('createLogger', () => {
  it('attaches service and environment metadata', () => {
    const { logger, getEntry } = createCapturedLogger();

    logger.info('metadata test');

    const entry = getEntry();

    expect(entry.service).toBe('test-service');

    expect(entry.environment).toBe('test');

    expect(entry.msg).toBe('metadata test');
  });

  it('redacts sensitive values', () => {
    const { logger, getEntry } = createCapturedLogger();

    logger.info(
      {
        password: 'secret-value',
        headers: {
          authorization: 'Bearer abc',
        },
      },
      'redaction test',
    );

    const entry = getEntry();

    expect(entry.password).toBe('[REDACTED]');

    expect(entry.headers).toEqual({
      authorization: '[REDACTED]',
    });

    const serialized = JSON.stringify(entry);

    expect(serialized).not.toContain('secret-value');

    expect(serialized).not.toContain('Bearer abc');
  });

  it('serializes Error objects', () => {
    const { logger, getEntry } = createCapturedLogger();

    logger.error(
      {
        err: new Error('boom'),
      },
      'failure',
    );

    const entry = getEntry();

    expect(entry.err).toMatchObject({
      type: 'Error',
      message: 'boom',
    });
  });
});
