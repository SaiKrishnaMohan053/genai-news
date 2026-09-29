import { lookup as nodeLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import { normalizeArticleUrl } from '@genai-news/shared';

const blockedIpv4 = new BlockList();

const BLOCKED_IPV4_SUBNETS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

for (const [address, prefix] of BLOCKED_IPV4_SUBNETS) {
  blockedIpv4.addSubnet(address, prefix, 'ipv4');
}

const blockedIpv6 = new BlockList();

const BLOCKED_IPV6_SUBNETS: ReadonlyArray<readonly [string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
];

for (const [address, prefix] of BLOCKED_IPV6_SUBNETS) {
  blockedIpv6.addSubnet(address, prefix, 'ipv6');
}

const blockedHostnames = new Set(['localhost', 'localhost.localdomain']);

export type ResearchDnsLookup = (
  hostname: string,
) => Promise<ReadonlyArray<{ address: string; family: 4 | 6 }>>;

export type SafeResearchUrl = Readonly<{
  url: string;
  canonicalUrl: string;
  hostname: string;
  addresses: readonly string[];
}>;

export class ResearchUrlSafetyError extends Error {
  readonly code = 'blocked-url' as const;

  constructor() {
    super('Research URL is not safe to fetch.');
    this.name = 'ResearchUrlSafetyError';
  }
}

export async function resolveSafeResearchUrl(
  value: string,
  options: Readonly<{
    lookup?: ResearchDnsLookup;
  }> = {},
): Promise<SafeResearchUrl> {
  const normalized = normalizeArticleUrl(value);

  if (normalized === null) {
    throw new ResearchUrlSafetyError();
  }

  const parsed = new URL(normalized.url);
  const hostname = normalizeHostname(parsed.hostname);

  if (isBlockedHostname(hostname)) {
    throw new ResearchUrlSafetyError();
  }

  const literalFamily = isIP(hostname);

  if (literalFamily === 4 || literalFamily === 6) {
    if (!isPublicAddress(hostname, literalFamily)) {
      throw new ResearchUrlSafetyError();
    }

    return Object.freeze({
      url: normalized.url,
      canonicalUrl: normalized.canonicalUrl,
      hostname,
      addresses: Object.freeze([hostname]),
    });
  }

  const lookup = options.lookup ?? defaultLookup;

  let records: ReadonlyArray<{ address: string; family: 4 | 6 }>;

  try {
    records = await lookup(hostname);
  } catch {
    throw new ResearchUrlSafetyError();
  }

  if (records.length === 0) {
    throw new ResearchUrlSafetyError();
  }

  const addresses: string[] = [];

  for (const record of records) {
    if (
      (record.family !== 4 && record.family !== 6) ||
      isIP(record.address) !== record.family ||
      !isPublicAddress(record.address, record.family)
    ) {
      throw new ResearchUrlSafetyError();
    }

    if (!addresses.includes(record.address)) {
      addresses.push(record.address);
    }
  }

  if (addresses.length === 0) {
    throw new ResearchUrlSafetyError();
  }

  return Object.freeze({
    url: normalized.url,
    canonicalUrl: normalized.canonicalUrl,
    hostname,
    addresses: Object.freeze(addresses),
  });
}

function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();

  if (lower.startsWith('[') && lower.endsWith(']')) {
    return lower.slice(1, -1);
  }

  return lower;
}

function isBlockedHostname(hostname: string): boolean {
  return (
    blockedHostnames.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  );
}

function isPublicAddress(address: string, family: 4 | 6): boolean {
  return family === 4
    ? !blockedIpv4.check(address, 'ipv4')
    : !blockedIpv6.check(address, 'ipv6');
}

async function defaultLookup(
  hostname: string,
): Promise<ReadonlyArray<{ address: string; family: 4 | 6 }>> {
  const records = await nodeLookup(hostname, {
    all: true,
    verbatim: true,
  });

  return records.flatMap((record) =>
    record.family === 4 || record.family === 6
      ? [
          {
            address: record.address,
            family: record.family,
          },
        ]
      : [],
  );
}