# GenAI News

A controlled multi-agent GenAI news application built around an orchestrator architecture.

The project is designed to support a complete AI-assisted news workflow:

**Research → Verification → Ranking → Content Generation → Visual Generation → Human Approval → Publishing**

The system is being developed incrementally, with infrastructure, application behavior, AI orchestration, evaluation, and publishing introduced in separate phases.

---

## Development Status

### Phase 0: Foundation & Infrastructure ✅ Complete

Phase 0 established the production-oriented foundation for the application.

Completed capabilities include:

- pnpm monorepo architecture
- Next.js frontend foundation
- Fastify API foundation
- Dedicated background worker
- PostgreSQL persistence
- Prisma schema and migrations
- Redis infrastructure
- BullMQ background job processing
- Shared cross-service schemas
- Structured Pino logging
- Request and job correlation
- OpenTelemetry tracing
- API and worker health/readiness checks
- Unit and integration testing
- Infrastructure smoke testing
- Full local Docker environment
- Automated database migration service
- GitHub Actions CI pipeline
- Dependency failure and recovery validation

Phase 0 intentionally contains **no news retrieval, LLM, agent, verification, content-generation, image-generation, or publishing behavior**.

Those capabilities are introduced in later phases on top of the validated Phase 0 foundation.

---

## Architecture

The application uses a monorepo containing independently runnable applications and reusable infrastructure packages.

```text
genai-news/
│
├── apps/
│   ├── web/              # Next.js frontend
│   ├── api/              # Fastify API
│   └── worker/           # Background job worker
│
├── packages/
│   ├── schemas/          # Cross-service schemas and contracts
│   ├── database/         # Prisma and PostgreSQL access
│   ├── queue/            # Redis and BullMQ infrastructure
│   ├── observability/    # Logging and OpenTelemetry
│   ├── shared/           # Generic shared utilities
│   ├── agents/           # Agent implementations in later phases
│   ├── tools/            # External tool integrations in later phases
│   └── evals/            # AI evaluation infrastructure in later phases
│
├── infra/
│   ├── docker/           # Local Docker environment
│   └── observability/    # Observability infrastructure
│
└── .github/
    └── workflows/        # CI workflows
```

---

## Applications

### `apps/web`

Next.js + TypeScript frontend.

Phase 0 provides the frontend application foundation and production build configuration. The news dashboard and human approval workflows will be implemented in later phases.

### `apps/api`

Fastify + TypeScript API.

Current responsibilities include:

- environment validation
- application lifecycle
- centralized error handling
- structured logging
- PostgreSQL connectivity
- Redis connectivity
- liveness checks
- readiness checks
- OpenTelemetry instrumentation

Health endpoints:

```text
GET /health/live
GET /health/ready
```

### `apps/worker`

Dedicated background worker built around BullMQ.

Current responsibilities include:

- Redis-backed job consumption
- deterministic infrastructure jobs
- structured job logging
- job correlation
- OpenTelemetry job spans
- worker liveness/readiness checks

Health endpoints:

```text
GET /health/live
GET /health/ready
```

---

## Shared Packages

### `@genai-news/schemas`

Typed contracts shared across application boundaries, including queue job schemas.

### `@genai-news/database`

Shared PostgreSQL infrastructure using Prisma.

Provides:

- Prisma schema
- generated client
- migrations
- database connectivity
- database health checks

### `@genai-news/queue`

Shared Redis and BullMQ infrastructure.

Provides:

- Redis connection configuration
- queue definitions
- producer infrastructure
- worker connection strategy
- queue health checks
- deterministic smoke-job support

### `@genai-news/observability`

Shared observability infrastructure.

Provides:

- Pino structured logging
- service metadata
- request/job correlation
- OpenTelemetry initialization
- tracing helpers
- worker job spans

### `@genai-news/shared`

Generic utilities shared between applications and packages.

### `@genai-news/agents`

Reserved for the controlled multi-agent architecture introduced in later phases.

### `@genai-news/tools`

Reserved for news providers, publishing integrations, model tools, and other external capabilities introduced later.

### `@genai-news/evals`

Reserved for AI quality evaluation and regression infrastructure introduced once AI behavior exists.

---

## Infrastructure

The local Docker environment runs:

```text
Web
 │
 ▼
API
 ├────────► PostgreSQL
 │
 └────────► Redis
              │
              ▼
            BullMQ
              │
              ▼
            Worker
```

Docker services include:

- `web`
- `api`
- `worker`
- `postgres`
- `redis`
- `migrate`

The migration service applies Prisma migrations before the API becomes available.

Service readiness is dependency-aware:

- API readiness requires PostgreSQL and Redis
- Worker readiness requires Redis
- liveness remains independent of dependency readiness

---

## Testing

Phase 0 established three validation layers.

### Unit Tests

Vitest tests cover application and shared-package behavior.

### Integration Tests

Integration tests verify real infrastructure boundaries, including:

- API → PostgreSQL
- API → Redis
- BullMQ → Worker
- queue job processing

### Infrastructure Validation

The complete Docker environment has been validated for:

- service startup
- database migrations
- API health
- worker health
- frontend availability
- queue processing
- Redis failure and recovery
- PostgreSQL failure and recovery

---

## Observability

Phase 0 provides a shared observability foundation using Pino and OpenTelemetry.

Structured logs include contextual metadata such as:

```text
service
environment
requestId
jobId
jobName
```

OpenTelemetry instrumentation provides the foundation for:

- HTTP traces
- service traces
- worker/job traces
- service metadata
- future metrics and distributed trace propagation

---

## Continuous Integration

GitHub Actions validates the repository on every configured CI run.

The pipeline covers:

```text
Install
  ↓
Format Check
  ↓
Lint
  ↓
Typecheck
  ↓
Unit Tests
  ↓
Integration Tests
  ↓
Build
```

CI provisions PostgreSQL and Redis where required for integration validation.

---

## Technology Stack

| Area                  | Technology              |
| --------------------- | ----------------------- |
| Monorepo              | pnpm workspaces         |
| Language              | TypeScript              |
| Runtime               | Node.js 24              |
| Frontend              | Next.js                 |
| API                   | Fastify                 |
| Validation            | Zod                     |
| Database              | PostgreSQL              |
| ORM                   | Prisma                  |
| Cache / Queue Backend | Redis                   |
| Background Jobs       | BullMQ                  |
| Logging               | Pino                    |
| Telemetry             | OpenTelemetry           |
| Testing               | Vitest                  |
| Containers            | Docker / Docker Compose |
| CI                    | GitHub Actions          |

---

## Phase 0 Baseline

Phase 0 has been fully validated across:

- formatting
- linting
- TypeScript compilation
- unit tests
- integration tests
- production builds
- PostgreSQL migrations
- Redis connectivity
- BullMQ processing
- API readiness
- worker readiness
- dependency failure/recovery
- Docker orchestration
- structured logging
- OpenTelemetry instrumentation
- GitHub Actions CI

Validated baseline commit:

```text
176e3007c2f77ec28d05783b269cfb0bc879f2a2
```

---

## Next Phase

With the infrastructure baseline complete, development can move into **Phase 1**.

Phase 1 will introduce the first application-level news capabilities while preserving the boundaries established during Phase 0.

AI orchestration libraries and external integrations will only be introduced when the corresponding application behavior requires them.
