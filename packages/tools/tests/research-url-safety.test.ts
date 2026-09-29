import { describe, expect, it, vi } from 'vitest';

import {
  ResearchUrlSafetyError,
  resolveSafeResearchUrl,
  type ResearchDnsLookup,
} from '../src/index.js';

function lookup(records: ReadonlyArray<{ address: string; family: 4 | 6 }>): ResearchDnsLookup {
  return vi.fn(async () => records);
}

describe('research URL safety', () => {
  it('accepts a normalized public HTTPS URL', async () => {
    const dns = lookup([{ address: '93.184.216.34', family: 4 }]);

    const result = await resolveSafeResearchUrl(
      'https://example.com/story?utm_source=test&id=1#section',
      { lookup: dns },
    );

    expect(result).toEqual({
      url: 'https://example.com/story?utm_source=test&id=1',
      canonicalUrl: 'https://example.com/story?id=1',
      hostname: 'example.com',
      addresses: ['93.184.216.34'],
    });

    expect(dns).toHaveBeenCalledExactlyOnceWith('example.com');
  });

  it.each([
    'file:///etc/passwd',
    'ftp://example.com/file',
    'https://user:password@example.com/story',
  ])('rejects unsupported or credential-bearing URL %s', async (url) => {
    await expect(resolveSafeResearchUrl(url)).rejects.toBeInstanceOf(ResearchUrlSafetyError);
  });

  it.each([
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.1.10/',
    'http://0.0.0.0/',
    'http://[::1]/',
  ])('rejects directly addressed private or special endpoint %s', async (url) => {
    await expect(resolveSafeResearchUrl(url)).rejects.toBeInstanceOf(ResearchUrlSafetyError);
  });

  it.each([
    'http://localhost/',
    'http://api.localhost/',
    'http://printer.local/',
    'http://service.internal/',
  ])('rejects local hostnames %s without DNS lookup', async (url) => {
    const dns = lookup([{ address: '93.184.216.34', family: 4 }]);

    await expect(resolveSafeResearchUrl(url, { lookup: dns })).rejects.toBeInstanceOf(
      ResearchUrlSafetyError,
    );

    expect(dns).not.toHaveBeenCalled();
  });

  it('rejects a hostname resolving to a private IPv4 address', async () => {
    await expect(
      resolveSafeResearchUrl('https://news.example.com/story', {
        lookup: lookup([{ address: '10.20.30.40', family: 4 }]),
      }),
    ).rejects.toBeInstanceOf(ResearchUrlSafetyError);
  });

  it('rejects a hostname when any DNS answer is non-public', async () => {
    await expect(
      resolveSafeResearchUrl('https://news.example.com/story', {
        lookup: lookup([
          { address: '93.184.216.34', family: 4 },
          { address: '192.168.1.5', family: 4 },
        ]),
      }),
    ).rejects.toBeInstanceOf(ResearchUrlSafetyError);
  });

  it('accepts multiple public DNS answers and removes exact duplicates', async () => {
    const result = await resolveSafeResearchUrl('https://news.example.com/story', {
      lookup: lookup([
        { address: '93.184.216.34', family: 4 },
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ]),
    });

    expect(result.addresses).toEqual(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']);
  });

  it('rejects private IPv6 DNS answers', async () => {
    await expect(
      resolveSafeResearchUrl('https://news.example.com/story', {
        lookup: lookup([{ address: 'fd00::1234', family: 6 }]),
      }),
    ).rejects.toBeInstanceOf(ResearchUrlSafetyError);
  });

  it('rejects IPv4-mapped private IPv6 addresses', async () => {
    await expect(
      resolveSafeResearchUrl('https://news.example.com/story', {
        lookup: lookup([{ address: '::ffff:127.0.0.1', family: 6 }]),
      }),
    ).rejects.toBeInstanceOf(ResearchUrlSafetyError);
  });

  it('fails closed when DNS resolution throws', async () => {
    const dns = vi.fn<ResearchDnsLookup>().mockRejectedValue(new Error('dns failure'));

    await expect(
      resolveSafeResearchUrl('https://news.example.com/story', {
        lookup: dns,
      }),
    ).rejects.toBeInstanceOf(ResearchUrlSafetyError);
  });

  it('fails closed when DNS returns no addresses', async () => {
    await expect(
      resolveSafeResearchUrl('https://news.example.com/story', {
        lookup: lookup([]),
      }),
    ).rejects.toBeInstanceOf(ResearchUrlSafetyError);
  });

  it('rejects malformed DNS family metadata', async () => {
    await expect(
      resolveSafeResearchUrl('https://news.example.com/story', {
        lookup: lookup([{ address: '93.184.216.34', family: 6 }]),
      }),
    ).rejects.toBeInstanceOf(ResearchUrlSafetyError);
  });
});
