import pino, { type DestinationStream, type Logger } from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface CreateLoggerOptions {
  service: string;
  environment: string;
  level: LogLevel;
  destination?: DestinationStream;
}

const REDACT_PATHS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'authorization',
  'cookie',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
] as const;

export function createLogger({
  service,
  environment,
  level,
  destination,
}: CreateLoggerOptions): Logger {
  const options = {
    level,

    base: {
      service,
      environment,
    },

    redact: {
      paths: [...REDACT_PATHS],
      censor: '[REDACTED]',
    },

    serializers: {
      err: pino.stdSerializers.err,
    },
  };

  return destination ? pino(options, destination) : pino(options);
}

export type AppLogger = Logger;
