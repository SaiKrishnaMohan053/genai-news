import type { AppMetricsRegistry } from '@genai-news/observability';
import type { FastifyPluginAsync } from 'fastify';

interface MetricsRouteOptions {
  metrics: AppMetricsRegistry;
}

export const metricsRoutes: FastifyPluginAsync<MetricsRouteOptions> = async (
  app,
  options,
) => {
  app.get('/metrics', async (_request, reply) => {
    const output = await options.metrics.metrics();

    return reply
      .header('content-type', options.metrics.contentType)
      .send(output);
  });
};