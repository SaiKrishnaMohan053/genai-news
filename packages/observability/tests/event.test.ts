import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger, emitStructuredEvent } from '../src/index.js';

describe('emitStructuredEvent', () => {
  it('emits a machine-readable event name', () => {
    const stream = new PassThrough();

    let output = '';

    stream.on('data', (chunk) => {
      output += chunk.toString();
    });

    const logger = createLogger({
      service: 'worker',
      environment: 'test',
      level: 'info',
      destination: stream,
    });

    emitStructuredEvent({
      logger,
      event: 'news.discovery.completed',
      attributes: {
        sourceId: 'gnews',
        fetchedCount: 10,
      },
    });

    const entry = JSON.parse(output.trim()) as Record<string, unknown>;

    expect(entry.event).toBe('news.discovery.completed');

    expect(entry.sourceId).toBe('gnews');

    expect(entry.fetchedCount).toBe(10);
  });
});
