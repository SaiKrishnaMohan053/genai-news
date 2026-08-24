export function normalizeRequiredText(value: string): string | null {
  const normalized = normalizeText(value);

  return normalized.length > 0 ? normalized : null;
}

export function normalizeOptionalText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = normalizeText(value);

  return normalized.length > 0 ? normalized : null;
}

function normalizeText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}
