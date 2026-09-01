import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOpenAiSemanticEmbeddingClient } from '../src/index.js';

describe('OpenAI semantic embedding client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('embeds multiple inputs in one request and preserves request order', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              index: 1,
              embedding: [0, 1],
            },
            {
              index: 0,
              embedding: [1, 0],
            },
          ],
        }),
        {
          status: 200,

          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const client = createOpenAiSemanticEmbeddingClient({
      apiKey: 'test-key',

      model: 'text-embedding-3-small',

      endpoint: 'https://example.com/embeddings',
    });

    const result = await client.embed([
      {
        id: 'left',
        text: 'First title',
      },
      {
        id: 'right',
        text: 'Second title',
      },
    ]);

    expect(result).toEqual([
      {
        id: 'left',
        embedding: [1, 0],
      },
      {
        id: 'right',
        embedding: [0, 1],
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/embeddings',
      expect.objectContaining({
        method: 'POST',

        headers: {
          Authorization: 'Bearer test-key',

          'Content-Type': 'application/json',
        },
      }),
    );

    const request = fetchMock.mock.calls[0]?.[1];

    expect(JSON.parse(String(request?.body))).toEqual({
      model: 'text-embedding-3-small',

      input: ['First title', 'Second title'],

      encoding_format: 'float',
    });
  });

  it('returns no request for empty input', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const client = createOpenAiSemanticEmbeddingClient({
      apiKey: 'test-key',

      model: 'text-embedding-3-small',
    });

    await expect(client.embed([])).resolves.toEqual([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects duplicate request ids before calling OpenAI', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const client = createOpenAiSemanticEmbeddingClient({
      apiKey: 'test-key',

      model: 'text-embedding-3-small',
    });

    await expect(
      client.embed([
        {
          id: 'same',
          text: 'A',
        },
        {
          id: 'same',
          text: 'B',
        },
      ]),
    ).rejects.toThrow('Duplicate semantic embedding request id: same');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects response count mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              index: 0,
              embedding: [1, 0],
            },
          ],
        }),
        {
          status: 200,
        },
      ),
    );

    const client = createOpenAiSemanticEmbeddingClient({
      apiKey: 'test-key',

      model: 'text-embedding-3-small',
    });

    await expect(
      client.embed([
        {
          id: 'a',
          text: 'A',
        },
        {
          id: 'b',
          text: 'B',
        },
      ]),
    ).rejects.toThrow('OpenAI embedding response count mismatch. expected=2 actual=1');
  });

  it('surfaces failed OpenAI responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate limited', {
        status: 429,
      }),
    );

    const client = createOpenAiSemanticEmbeddingClient({
      apiKey: 'test-key',

      model: 'text-embedding-3-small',
    });

    await expect(
      client.embed([
        {
          id: 'a',
          text: 'Title',
        },
      ]),
    ).rejects.toThrow('OpenAI embedding request failed. status=429');
  });
});
