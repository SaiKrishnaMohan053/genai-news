export type GNewsErrorKind = 'timeout' | 'network' | 'http' | 'invalid-json' | 'invalid-response';

export type GNewsErrorOptions = {
  kind: GNewsErrorKind;
  message: string;
  statusCode?: number;
  cause?: unknown;
};

export class GNewsError extends Error {
  readonly kind: GNewsErrorKind;
  readonly statusCode?: number | undefined;

  constructor(options: GNewsErrorOptions) {
    super(options.message, {
      cause: options.cause,
    });

    this.name = 'GNewsError';
    this.kind = options.kind;
    this.statusCode = options.statusCode;
  }
}
