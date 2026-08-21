import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkerHealthServer } from '../src/health/server.js';

describe('worker health server', () => {
  const servers: ReturnType<typeof createWorkerHealthServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );

    servers.length = 0;
  });

  async function startServer(redis: unknown): Promise<string> {
    const server = createWorkerHealthServer({
      redis: redis as never,
    });

    servers.push(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address() as AddressInfo;

    return `http://127.0.0.1:${address.port}`;
  }

  it('returns worker liveness', async () => {
    const baseUrl = await startServer({
      status: 'ready',
      ping: vi.fn(),
    });

    const response = await fetch(`${baseUrl}/health/live`);

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'worker',
    });
  });

  it('returns readiness when Redis is healthy', async () => {
    const baseUrl = await startServer({
      status: 'ready',
      ping: vi.fn().mockResolvedValue('PONG'),
    });

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      service: 'worker',
      dependencies: {
        redis: 'healthy',
      },
    });
  });

  it('returns 503 when Redis is unhealthy', async () => {
    const baseUrl = await startServer({
      status: 'ready',
      ping: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    });

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toEqual({
      status: 'not_ready',
      service: 'worker',
      dependencies: {
        redis: 'unhealthy',
      },
    });
  });
});
