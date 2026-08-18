# GenAI News

A controlled multi-agent GenAI news application built around an orchestrator architecture.

## Current Development Phase

Phase 0: Production-oriented project foundation.

Phase 0 contains infrastructure and application foundations only.

News retrieval, research agents, verification agents, content generation, visual generation, social publishing, and AI evaluation are intentionally not implemented yet.

## Monorepo

### Applications

- `apps/web` - Next.js frontend
- `apps/api` - Fastify API
- `apps/worker` - Background worker

### Shared Packages

- `packages/schemas` - Typed cross-service schemas
- `packages/database` - Prisma and database access
- `packages/queue` - Queue contracts and BullMQ infrastructure
- `packages/observability` - Logging and telemetry
- `packages/shared` - Generic shared utilities
- `packages/agents` - Agent implementations in later phases
- `packages/tools` - Tool integrations in later phases
- `packages/evals` - AI evaluation infrastructure in later phases
