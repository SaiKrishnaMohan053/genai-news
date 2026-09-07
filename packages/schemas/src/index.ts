export type RuntimeService = 'web' | 'api' | 'worker';

export {
  jobIdSchema,
  newsDiscoveryJobSchema,
  systemPingJobSchema,
  type NewsDiscoveryJobPayload,
  type SystemPingJobPayload,
} from './jobs.js';

export {
  rssSourceConfigSchema,
  rssSourceConfigsJsonSchema,
  rssSourceConfigsSchema,
  type RssSourceConfig,
} from './news-sources.js';
