const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export async function POST(request: Request) {
  const body = await request.text();

  const response = await fetch(`${API_BASE_URL}/api/news/discover`, {
    method: 'POST',

    headers: {
      'content-type': 'application/json',
    },

    body,
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
