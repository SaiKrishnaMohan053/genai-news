export type RssErrorKind = 'timeout' | 'network' | 'http' | 'invalid-xml' | 'invalid-feed';

export type RssErrorOptions = {
  kind: RssErrorKind;
  message: string;
  statusCode?: number;
  cause?: unknown;
};

export class RssError extends Error {
  readonly kind: RssErrorKind;
  readonly statusCode: number | undefined;

  constructor(options: RssErrorOptions) {
    super(options.message, {
      cause: options.cause,
    });

    this.name = 'RssError';
    this.kind = options.kind;
    this.statusCode = options.statusCode;
  }
}
