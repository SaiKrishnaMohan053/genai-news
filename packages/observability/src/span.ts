import { SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api';

export interface RunWithSpanOptions {
  tracerName: string;
  spanName: string;
  attributes?: Attributes;
}

export async function runWithSpan<T>(
  options: RunWithSpanOptions,
  operation: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(options.tracerName);

  return tracer.startActiveSpan(options.spanName, async (span) => {
    try {
      if (options.attributes) {
        span.setAttributes(options.attributes);
      }

      const result = await operation(span);

      span.setStatus({
        code: SpanStatusCode.OK,
      });

      return result;
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
      }

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });

      throw error;
    } finally {
      span.end();
    }
  });
}
