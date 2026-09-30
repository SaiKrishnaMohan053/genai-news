import { createResearchJobId, RESEARCH_JOB_NAME, RESEARCH_QUEUE_NAME } from '../src/index.js';

import { describe, expect, it } from 'vitest';

describe('research queue', () => {
  it('uses stable queue and job names', () => {
    expect(RESEARCH_QUEUE_NAME).toBe('research');

    expect(RESEARCH_JOB_NAME).toBe('research.execute');
  });

  it('creates a deterministic job id from the research run id', () => {
    expect(createResearchJobId('research-run-123')).toBe('research_research-run-123');
  });

  it('normalizes surrounding whitespace before creating a job id', () => {
    expect(createResearchJobId('  research-run-123  ')).toBe('research_research-run-123');
  });

  it('rejects a blank research run id', () => {
    expect(() => createResearchJobId('   ')).toThrow('Research run id must be non-empty.');
  });

  it('rejects a generated job id that violates the shared job id contract', () => {
    expect(() => createResearchJobId('x'.repeat(500))).toThrow();
  });
});
