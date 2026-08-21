import { createServer, type Server, type ServerResponse } from 'node:http';

import { checkRedisHealth, type RedisClient } from '@genai-news/queue';

export interface CreateWorkerHealthServerOptions {
  redis: RedisClient;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;

  response.setHeader('content-type', 'application/json; charset=utf-8');

  response.end(JSON.stringify(body));
}

export function createWorkerHealthServer({ redis }: CreateWorkerHealthServerOptions): Server {
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health/live') {
      sendJson(response, 200, {
        status: 'ok',
        service: 'worker',
      });

      return;
    }

    if (request.method === 'GET' && request.url === '/health/ready') {
      const redisHealthy = await checkRedisHealth(redis);

      if (!redisHealthy) {
        sendJson(response, 503, {
          status: 'not_ready',
          service: 'worker',
          dependencies: {
            redis: 'unhealthy',
          },
        });

        return;
      }

      sendJson(response, 200, {
        status: 'ready',
        service: 'worker',
        dependencies: {
          redis: 'healthy',
        },
      });

      return;
    }

    sendJson(response, 404, {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method ?? 'UNKNOWN'} ${request.url ?? '/'} not found`,
      },
    });
  });
}
