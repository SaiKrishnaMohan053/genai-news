import { checkDatabaseHealth, type DatabaseClient } from '@genai-news/database';
import { checkRedisHealth, type RedisClient } from '@genai-news/queue';
import type { FastifyPluginAsync } from 'fastify';

interface HealthRouteOptions {
  database?: DatabaseClient;
  redis?: RedisClient;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  app.get('/health/live', async () => {
    return {
      status: 'ok',
      service: 'api',
    };
  });

  app.get('/health/ready', async (_request, reply) => {
    const [databaseHealthy, redisHealthy] = await Promise.all([
      options.database ? checkDatabaseHealth(options.database) : Promise.resolve(null),

      options.redis ? checkRedisHealth(options.redis) : Promise.resolve(null),
    ]);

    const dependencies = {
      database:
        databaseHealthy === null ? 'unavailable' : databaseHealthy ? 'healthy' : 'unhealthy',

      redis: redisHealthy === null ? 'unavailable' : redisHealthy ? 'healthy' : 'unhealthy',
    } as const;

    const ready = dependencies.database === 'healthy' && dependencies.redis === 'healthy';

    if (!ready) {
      return reply.status(503).send({
        status: 'not_ready',
        service: 'api',
        dependencies,
      });
    }

    return {
      status: 'ready',
      service: 'api',
      dependencies,
    };
  });
};
