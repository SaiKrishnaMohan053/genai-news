export type SemanticEmbeddingRequest = {
  id: string;
  text: string;
};

export type SemanticEmbeddingResult = {
  id: string;
  embedding: readonly number[];
};

export type SemanticEmbeddingClient = {
  embed(inputs: readonly SemanticEmbeddingRequest[]): Promise<readonly SemanticEmbeddingResult[]>;
};

export type OpenAiSemanticEmbeddingClientOptions = {
  apiKey: string;
  model: string;
  endpoint?: string;
};

type OpenAiEmbeddingResponse = {
  data: Array<{
    index: number;
    embedding: number[];
  }>;
};

export function createOpenAiSemanticEmbeddingClient(
  options: OpenAiSemanticEmbeddingClientOptions,
): SemanticEmbeddingClient {
  const endpoint = options.endpoint ?? 'https://api.openai.com/v1/embeddings';

  if (options.apiKey.trim().length === 0) {
    throw new Error('OpenAI API key must be non-empty.');
  }

  if (options.model.trim().length === 0) {
    throw new Error('Embedding model must be non-empty.');
  }

  return {
    async embed(
      inputs: readonly SemanticEmbeddingRequest[],
    ): Promise<readonly SemanticEmbeddingResult[]> {
      if (inputs.length === 0) {
        return [];
      }

      const response = await fetch(endpoint, {
        method: 'POST',

        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          model: options.model,

          input: inputs.map((input) => input.text),

          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        const body = await response.text();

        throw new Error(
          ['OpenAI embedding request failed.', `status=${response.status}`, body].join(' '),
        );
      }

      const payload = (await response.json()) as unknown;

      const parsed = parseEmbeddingResponse(payload);

      if (parsed.data.length !== inputs.length) {
        throw new Error(
          [
            'OpenAI embedding response count mismatch.',
            `expected=${inputs.length}`,
            `actual=${parsed.data.length}`,
          ].join(' '),
        );
      }

      const ordered = [...parsed.data].sort((left, right) => left.index - right.index);

      return ordered.map((item, index) => {
        const input = inputs[index]!;

        validateEmbedding(item.embedding, input.id);

        return {
          id: input.id,
          embedding: item.embedding,
        };
      });
    },
  };
}

function parseEmbeddingResponse(value: unknown): OpenAiEmbeddingResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('data' in value) ||
    !Array.isArray(value.data)
  ) {
    throw new Error('OpenAI embedding response has invalid shape.');
  }

  const data = value.data.map((item, position) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('index' in item) ||
      !('embedding' in item) ||
      typeof item.index !== 'number' ||
      !Array.isArray(item.embedding)
    ) {
      throw new Error(`Invalid OpenAI embedding item at position ${position}.`);
    }

    return {
      index: item.index,

      embedding: item.embedding.map((component: unknown) => {
        if (typeof component !== 'number' || !Number.isFinite(component)) {
          throw new Error(`Invalid embedding component at position ${position}.`);
        }

        return component;
      }),
    };
  });

  return { data };
}

function validateEmbedding(embedding: readonly number[], id: string): void {
  if (embedding.length === 0) {
    throw new Error(`Embedding for ${id} must not be empty.`);
  }

  for (const value of embedding) {
    if (!Number.isFinite(value)) {
      throw new Error(`Embedding for ${id} contains a non-finite value.`);
    }
  }
}
