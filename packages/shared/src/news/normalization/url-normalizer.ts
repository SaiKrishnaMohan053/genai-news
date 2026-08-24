const TRACKING_PARAMETER_NAMES = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
]);

export type NormalizedUrl = {
  url: string;
  canonicalUrl: string;
};

export function normalizeArticleUrl(value: string): NormalizedUrl | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  parsed.hash = '';

  const normalizedUrl = parsed.toString();

  const canonical = new URL(normalizedUrl);

  for (const key of [...canonical.searchParams.keys()]) {
    if (isTrackingParameter(key)) {
      canonical.searchParams.delete(key);
    }
  }

  canonical.searchParams.sort();

  return {
    url: normalizedUrl,
    canonicalUrl: canonical.toString(),
  };
}

function isTrackingParameter(name: string): boolean {
  const normalized = name.toLowerCase();

  return normalized.startsWith('utm_') || TRACKING_PARAMETER_NAMES.has(normalized);
}
