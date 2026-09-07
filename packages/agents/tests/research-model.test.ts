import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadResearchModelConfig, parseResearchModelConfig } from '../src/research/model-config.js';
import { createResearchModel, createResearchModelCallOptions } from '../src/research/model.js';

const config = loadResearchModelConfig({});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('research model foundation', () => {
  it('loads defaults without credentials and keeps config immutable', () => {
    expect(config).toEqual({
      provider: 'openai',
      model: 'gpt-4.1-mini-2025-04-14',
      maxOutputTokens: 4096,
      timeoutMs: 30000,
    });

    expect(Object.isFrozen(config)).toBe(true);
  });

  it('parses explicit environment limits', () => {
    expect(
      loadResearchModelConfig({
        RESEARCH_MODEL_MAX_OUTPUT_TOKENS: '2048',
        RESEARCH_MODEL_TIMEOUT_MS: '15000',
      }),
    ).toMatchObject({
      maxOutputTokens: 2048,
      timeoutMs: 15000,
    });
  });

  it.each([
    { RESEARCH_MODEL_PROVIDER: 'unsupported' },
    { RESEARCH_MODEL_NAME: 'unapproved-model' },
    { RESEARCH_MODEL_MAX_OUTPUT_TOKENS: '' },
    { RESEARCH_MODEL_MAX_OUTPUT_TOKENS: '8193' },
    { RESEARCH_MODEL_MAX_OUTPUT_TOKENS: '1.5' },
    { RESEARCH_MODEL_TIMEOUT_MS: 'NaN' },
    { RESEARCH_MODEL_TIMEOUT_MS: '0' },
    { RESEARCH_MODEL_TIMEOUT_MS: '120001' },
  ])('rejects invalid configuration %j', (env) => {
    expect(() => loadResearchModelConfig(env)).toThrow('Invalid research model configuration');
  });

  it('rejects unknown config fields without exposing values', () => {
    expect(() => parseResearchModelConfig({ apiKey: 'secret-value' })).toThrow(
      'Invalid research model configuration: config',
    );
  });

  it('requires an explicit nonblank key even when an ambient key exists', () => {
    vi.stubEnv('OPENAI_API_KEY', 'ambient-key');

    expect(() => createResearchModel(config, '   ')).toThrow('Research model API key is required');
  });

  it('constructs the model without making a request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    createResearchModel(config, 'test-key');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the direct endpoint and does not retry quota failures', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: 'Quota exhausted',
              type: 'insufficient_quota',
              code: 'insufficient_quota',
            },
          }),
          {
            status: 429,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );

    vi.stubGlobal('fetch', fetchMock);

    const model = createResearchModel(config, 'test-key');

    await expect(model.invoke('test', createResearchModelCallOptions(config))).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0];

    if (!call) {
      throw new Error('Expected a request');
    }

    const request = new Request(call[0], call[1]);

    expect(new URL(request.url).hostname).toBe('api.openai.com');
    expect(new URL(request.url).pathname).toBe('/v1/chat/completions');

    expect(await request.json()).toMatchObject({
      model: 'gpt-4.1-mini-2025-04-14',
      temperature: 0,
      max_tokens: 4096,
      store: false,
    });
  });

  it('aborts a request when its timeout expires', async () => {
    const shortConfig = parseResearchModelConfig({
      timeoutMs: 1000,
    });

    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init?.signal?.reason), {
            once: true,
          });
        }),
    );

    vi.stubGlobal('fetch', fetchMock);

    await expect(createResearchModel(shortConfig, 'test-key').invoke('test')).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('propagates cancellation to an in-flight model request', async () => {
    const controller = new AbortController();

    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init?.signal?.reason), {
            once: true,
          });

          controller.abort(new Error('research cancelled'));
        }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const model = createResearchModel(config, 'test-key');

    await expect(
      model.invoke('test', createResearchModelCallOptions(config, controller.signal)),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
