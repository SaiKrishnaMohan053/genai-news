import { describe, expect, it, vi } from 'vitest';

import {
  ResearchArticleFetchError,
  fetchResearchArticle,
  type ResearchArticleTransport,
  type ResearchArticleTransportInput,
} from '../src/index.js';

function transport(
  implementation: (input: ResearchArticleTransportInput) => Promise<{
    statusCode: number;
    headers: Record<string, string | undefined>;
    body: Uint8Array;
  }>,
): ResearchArticleTransport {
  return {
    request: vi.fn(implementation),
  };
}

function dns(address = '93.184.216.34') {
  return vi.fn(async () => [{ address, family: 4 as const }]);
}

function body(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe('research article fetcher', () => {
  it('fetches bounded HTML text through a DNS-approved address', async () => {
    const network = transport(async (input) => {
      expect(input.address).toBe('93.184.216.34');
      expect(input.family).toBe(4);

      return {
        statusCode: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
        body: body(`
          <html>
            <head>
              <style>.hidden { display: none }</style>
              <script>ignore()</script>
            </head>
            <body>
              <h1>AI announcement</h1>
              <p>New model &amp; details.</p>
            </body>
          </html>
        `),
      };
    });

    const result = await fetchResearchArticle('https://example.com/story?utm_source=test', {
      lookup: dns(),
      transport: network,
      now: () => new Date('2026-09-29T18:00:00.000Z'),
    });

    expect(result).toEqual({
      finalUrl: 'https://example.com/story?utm_source=test',
      canonicalUrl: 'https://example.com/story',
      text: 'AI announcement New model & details.',
      fetchedAt: new Date('2026-09-29T18:00:00.000Z'),
      truncated: false,
      redirectCount: 0,
    });
  });

  it('revalidates DNS and URL safety after every redirect', async () => {
    const lookup = vi.fn(async (hostname: string) => {
      return hostname === 'example.com'
        ? [{ address: '93.184.216.34', family: 4 as const }]
        : [{ address: '1.1.1.1', family: 4 as const }];
    });

    const network = transport(async (input) => {
      if (input.url === 'https://example.com/start') {
        return {
          statusCode: 302,
          headers: {
            location: 'https://news.example.org/final',
          },
          body: body(''),
        };
      }

      expect(input.address).toBe('1.1.1.1');

      return {
        statusCode: 200,
        headers: {
          'content-type': 'text/plain',
        },
        body: body('Final article text'),
      };
    });

    const result = await fetchResearchArticle('https://example.com/start', {
      lookup,
      transport: network,
    });

    expect(result.redirectCount).toBe(1);
    expect(result.finalUrl).toBe('https://news.example.org/final');
    expect(lookup).toHaveBeenCalledWith('example.com');
    expect(lookup).toHaveBeenCalledWith('news.example.org');
  });

  it('blocks a redirect that resolves to a private address', async () => {
    const lookup = vi.fn(async (hostname: string) => {
      return hostname === 'example.com'
        ? [{ address: '93.184.216.34', family: 4 as const }]
        : [{ address: '127.0.0.1', family: 4 as const }];
    });

    const network = transport(async () => ({
      statusCode: 302,
      headers: {
        location: 'https://internal.example/final',
      },
      body: body(''),
    }));

    await expect(
      fetchResearchArticle('https://example.com/start', {
        lookup,
        transport: network,
      }),
    ).rejects.toMatchObject({
      kind: 'blocked-url',
    });
  });

  it('rejects redirects beyond the configured limit', async () => {
    const network = transport(async () => ({
      statusCode: 302,
      headers: {
        location: '/again',
      },
      body: body(''),
    }));

    await expect(
      fetchResearchArticle('https://example.com/start', {
        lookup: dns(),
        transport: network,
        maxRedirects: 1,
      }),
    ).rejects.toMatchObject({
      kind: 'invalid-redirect',
    });
  });

  it('rejects redirects without a Location header', async () => {
    const network = transport(async () => ({
      statusCode: 302,
      headers: {},
      body: body(''),
    }));

    await expect(
      fetchResearchArticle('https://example.com/start', {
        lookup: dns(),
        transport: network,
      }),
    ).rejects.toMatchObject({
      kind: 'invalid-redirect',
    });
  });

  it.each(['application/json', 'application/pdf', 'image/png'])(
    'rejects unsupported content type %s',
    async (contentType) => {
      const network = transport(async () => ({
        statusCode: 200,
        headers: {
          'content-type': contentType,
        },
        body: body('payload'),
      }));

      await expect(
        fetchResearchArticle('https://example.com/story', {
          lookup: dns(),
          transport: network,
        }),
      ).rejects.toMatchObject({
        kind: 'unsupported-content',
      });
    },
  );

  it('keeps text truncation explicit', async () => {
    const network = transport(async () => ({
      statusCode: 200,
      headers: {
        'content-type': 'text/plain',
      },
      body: body('abcdefghij'),
    }));

    const result = await fetchResearchArticle('https://example.com/story', {
      lookup: dns(),
      transport: network,
      maxTextLength: 5,
    });

    expect(result.text).toBe('abcde');
    expect(result.truncated).toBe(true);
  });

  it('preserves a non-truncated short text response', async () => {
    const network = transport(async () => ({
      statusCode: 200,
      headers: {
        'content-type': 'text/plain',
      },
      body: body('Short article'),
    }));

    const result = await fetchResearchArticle('https://example.com/story', {
      lookup: dns(),
      transport: network,
      maxTextLength: 100,
    });

    expect(result.text).toBe('Short article');
    expect(result.truncated).toBe(false);
  });

  it('rejects empty extracted HTML', async () => {
    const network = transport(async () => ({
      statusCode: 200,
      headers: {
        'content-type': 'text/html',
      },
      body: body('<script>onlyScript()</script>'),
    }));

    await expect(
      fetchResearchArticle('https://example.com/story', {
        lookup: dns(),
        transport: network,
      }),
    ).rejects.toMatchObject({
      kind: 'unsupported-content',
    });
  });

  it('rejects non-success HTTP status', async () => {
    const network = transport(async () => ({
      statusCode: 503,
      headers: {
        'content-type': 'text/plain',
      },
      body: body('Unavailable'),
    }));

    await expect(
      fetchResearchArticle('https://example.com/story', {
        lookup: dns(),
        transport: network,
      }),
    ).rejects.toMatchObject({
      kind: 'http',
      statusCode: 503,
    });
  });

  it('propagates caller cancellation', async () => {
    const controller = new AbortController();

    const network = transport(async ({ signal }) => {
      controller.abort(new Error('cancelled'));
      signal.throwIfAborted();

      throw new Error('unreachable');
    });

    await expect(
      fetchResearchArticle('https://example.com/story', {
        lookup: dns(),
        transport: network,
        signal: controller.signal,
      }),
    ).rejects.toThrow('cancelled');
  });

  it('converts deadline expiry to a timeout error', async () => {
    const network = transport(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        }),
    );

    await expect(
      fetchResearchArticle('https://example.com/story', {
        lookup: dns(),
        transport: network,
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('preserves explicit transport size failures', async () => {
    const network = transport(async () => {
      throw new ResearchArticleFetchError('response-too-large');
    });

    await expect(
      fetchResearchArticle('https://example.com/story', {
        lookup: dns(),
        transport: network,
      }),
    ).rejects.toMatchObject({
      kind: 'response-too-large',
    });
  });

  it('maps unexpected transport failures to network', async () => {
    const network = transport(async () => {
      throw new Error('socket failed');
    });

    await expect(
      fetchResearchArticle('https://example.com/story', {
        lookup: dns(),
        transport: network,
      }),
    ).rejects.toMatchObject({
      kind: 'network',
    });
  });
});
