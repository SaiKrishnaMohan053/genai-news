const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  const limit = requestUrl.searchParams.get('limit') ?? '25';

  const response = await fetch(
    `${API_BASE_URL}/api/news/articles?limit=${encodeURIComponent(limit)}`,
    {
      cache: 'no-store',
    },
  );

  const responseBody = await response.text();

  return new Response(responseBody, {
    status: response.status,

    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}
