import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health/live', async () => {
    return {
      status: 'ok',
      service: 'api',
    };
  });

  app.get('/health/ready', async () => {
    return {
      status: 'ready',
      service: 'api',
    };
  });
};
