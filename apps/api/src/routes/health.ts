import { checkDatabaseHealth, type DatabaseClient } from '@genai-news/database';
import type { FastifyPluginAsync } from 'fastify';

interface HealthRouteOptions {
  database?: DatabaseClient;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  app.get('/health/live', async () => {
    return {
      status: 'ok',
      service: 'api',
    };
  });

  app.get('/health/ready', async (_request, reply) => {
    if (!options.database) {
      return reply.status(503).send({
        status: 'not_ready',
        service: 'api',
        dependencies: {
          database: 'unavailable',
        },
      });
    }

    const databaseHealthy = await checkDatabaseHealth(options.database);

    if (!databaseHealthy) {
      return reply.status(503).send({
        status: 'not_ready',
        service: 'api',
        dependencies: {
          database: 'unhealthy',
        },
      });
    }

    return {
      status: 'ready',
      service: 'api',
      dependencies: {
        database: 'healthy',
      },
    };
  });
};
