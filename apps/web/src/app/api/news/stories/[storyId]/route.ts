const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

interface StoryRouteContext {
  params: Promise<{
    storyId: string;
  }>;
}

export async function GET(_request: Request, context: StoryRouteContext) {
  const { storyId } = await context.params;

  const response = await fetch(`${API_BASE_URL}/api/news/stories/${encodeURIComponent(storyId)}`, {
    cache: 'no-store',
  });

  const responseBody = await response.text();

  return new Response(responseBody, {
    status: response.status,

    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}
