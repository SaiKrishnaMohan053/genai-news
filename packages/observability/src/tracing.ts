import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

export interface CreateTracingOptions {
  serviceName: string;
  serviceVersion: string;
  environment: string;
}

export type TracingSdk = NodeSDK;

export function createTracing({
  serviceName,
  serviceVersion,
  environment,
}: CreateTracingOptions): TracingSdk {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    'deployment.environment.name': environment,
  });

  return new NodeSDK({
    resource,
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
    instrumentations: [getNodeAutoInstrumentations()],
  });
}
