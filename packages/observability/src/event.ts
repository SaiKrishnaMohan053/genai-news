export type StructuredEventLevel =
  | 'info'
  | 'warn'
  | 'error';

export interface StructuredEventLogger {
  info(
    fields: Record<string, unknown>,
    message: string,
  ): void;

  warn(
    fields: Record<string, unknown>,
    message: string,
  ): void;

  error(
    fields: Record<string, unknown>,
    message: string,
  ): void;
}

export interface EmitStructuredEventOptions {
  logger: StructuredEventLogger;
  event: string;
  level?: StructuredEventLevel;
  attributes?: Record<string, unknown>;
  error?: unknown;
}

export function emitStructuredEvent(
  options: EmitStructuredEventOptions,
): void {
  const level = options.level ?? 'info';

  const fields = {
    event: options.event,

    ...(options.attributes ?? {}),

    ...(options.error !== undefined
      ? {
          err: options.error,
        }
      : {}),
  };

  options.logger[level](
    fields,
    options.event,
  );
}