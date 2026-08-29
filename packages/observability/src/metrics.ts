import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
  type CounterConfiguration,
  type HistogramConfiguration,
} from 'prom-client';

export interface CreateMetricsRegistryOptions {
  service: string;
  environment: string;
  collectDefaults?: boolean;
}

export interface AppMetricsRegistry {
  registry: Registry;

  counter<T extends string>(configuration: CounterConfiguration<T>): Counter<T>;

  histogram<T extends string>(configuration: HistogramConfiguration<T>): Histogram<T>;

  metrics(): Promise<string>;

  contentType: string;
}

export function createMetricsRegistry(options: CreateMetricsRegistryOptions): AppMetricsRegistry {
  const registry = new Registry();

  registry.setDefaultLabels({
    service: options.service,
    environment: options.environment,
  });

  if (options.collectDefaults ?? true) {
    collectDefaultMetrics({
      register: registry,
    });
  }

  return {
    registry,

    counter<T extends string>(configuration: CounterConfiguration<T>): Counter<T> {
      return new Counter({
        ...configuration,
        registers: [registry],
      });
    },

    histogram<T extends string>(configuration: HistogramConfiguration<T>): Histogram<T> {
      return new Histogram({
        ...configuration,
        registers: [registry],
      });
    },

    metrics(): Promise<string> {
      return registry.metrics();
    },

    contentType: registry.contentType,
  };
}
