const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

interface StoryResearchRouteContext {
  params: Promise<{
    storyId: string;
  }>;
}

export async function GET(_request: Request, context: StoryResearchRouteContext) {
  const { storyId } = await context.params;

  const response = await fetch(
    `${API_BASE_URL}/api/news/stories/${encodeURIComponent(storyId)}/research`,
    {
      cache: 'no-store',
    },
  );

  return proxyResponse(response);
}

export async function POST(request: Request, context: StoryResearchRouteContext) {
  const { storyId } = await context.params;

  const headers = new Headers();

  headers.set('content-type', request.headers.get('content-type') ?? 'application/json');

  const idempotencyKey = request.headers.get('idempotency-key');

  if (idempotencyKey) {
    headers.set('idempotency-key', idempotencyKey);
  }

  const response = await fetch(
    `${API_BASE_URL}/api/news/stories/${encodeURIComponent(storyId)}/research`,
    {
      method: 'POST',
      headers,
      body: await request.text(),
      cache: 'no-store',
    },
  );

  return proxyResponse(response);
}

async function proxyResponse(response: Response) {
  const responseBody = await response.text();

  return new Response(responseBody, {
    status: response.status,

    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}
