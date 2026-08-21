import { describe, expect, it, vi } from 'vitest';

import { checkRedisHealth } from '../src/health.js';

describe('checkRedisHealth', () => {
  it('connects when Redis client is waiting', async () => {
    const client = {
      status: 'wait',
      connect: vi.fn().mockResolvedValue(undefined),
      ping: vi.fn().mockResolvedValue('PONG'),
    };

    await expect(checkRedisHealth(client as never)).resolves.toBe(true);

    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.ping).toHaveBeenCalledOnce();
  });

  it('does not reconnect an already connected client', async () => {
    const client = {
      status: 'ready',
      connect: vi.fn(),
      ping: vi.fn().mockResolvedValue('PONG'),
    };

    await expect(checkRedisHealth(client as never)).resolves.toBe(true);

    expect(client.connect).not.toHaveBeenCalled();
  });

  it('returns false when Redis does not return PONG', async () => {
    const client = {
      status: 'ready',
      connect: vi.fn(),
      ping: vi.fn().mockResolvedValue('NOPE'),
    };

    await expect(checkRedisHealth(client as never)).resolves.toBe(false);
  });

  it('returns false when Redis throws', async () => {
    const client = {
      status: 'ready',
      connect: vi.fn(),
      ping: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    };

    await expect(checkRedisHealth(client as never)).resolves.toBe(false);
  });
});
