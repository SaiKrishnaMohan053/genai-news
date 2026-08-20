import { systemPingJobSchema, type SystemPingJobPayload } from '@genai-news/schemas';

export interface SystemPingResult {
  processed: true;
  message: string;
  requestedAt: string;
  processedAt: string;
}

export function processSystemPing(payload: SystemPingJobPayload): SystemPingResult {
  const validated = systemPingJobSchema.parse(payload);

  return {
    processed: true,
    message: validated.message,
    requestedAt: validated.requestedAt,
    processedAt: new Date().toISOString(),
  };
}
