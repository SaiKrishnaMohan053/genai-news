import { randomUUID } from 'node:crypto';

import {
  enqueueNewsDiscovery,
  NEWS_DISCOVERY_JOB_NAME,
  type NewsDiscoveryQueue,
} from '@genai-news/queue';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { AppError } from '../errors/app-error.js';

const discoveryRequestSchema = z.object({
  sourceId: z.literal('gnews'),
  limit: z.number().int().positive().max(100),
});

interface NewsDiscoveryRouteOptions {
  queue?: NewsDiscoveryQueue;
  now?: () => Date;
  createJobId?: () => string;
}

export const newsDiscoveryRoutes: FastifyPluginAsync<NewsDiscoveryRouteOptions> = async (
  app,
  options,
) => {
  app.post('/api/news/discover', async (request, reply) => {
    if (!options.queue) {
      throw new AppError('News discovery queue is unavailable', 503, 'NEWS_DISCOVERY_UNAVAILABLE');
    }

    const parsed = discoveryRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Invalid news discovery request', 400, 'INVALID_DISCOVERY_REQUEST');
    }

    const now = options.now ?? (() => new Date());
    const createJobId = options.createJobId ?? randomUUID;

    const requestedAt = now().toISOString();
    const jobId = createJobId();

    await enqueueNewsDiscovery(
      options.queue,
      {
        sourceId: parsed.data.sourceId,
        limit: parsed.data.limit,
        requestedAt,
      },
      jobId,
    );

    return reply.status(202).send({
      status: 'accepted',
      job: {
        id: jobId,
        name: NEWS_DISCOVERY_JOB_NAME,
      },
    });
  });
};
