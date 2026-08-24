import { describe, expect, it } from 'vitest';

import { normalizeOptionalText, normalizeRequiredText } from '../src/news/index.js';

describe('text normalization', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeRequiredText('  Example   news\n headline  ')).toBe('Example news headline');
  });

  it('returns null for blank required text', () => {
    expect(normalizeRequiredText('   ')).toBeNull();
  });

  it('returns null for missing optional text', () => {
    expect(normalizeOptionalText(undefined)).toBeNull();
  });

  it('returns null for blank optional text', () => {
    expect(normalizeOptionalText('   ')).toBeNull();
  });

  it('normalizes Unicode to NFC', () => {
    expect(normalizeRequiredText('e\u0301')).toBe('é');
  });
});
