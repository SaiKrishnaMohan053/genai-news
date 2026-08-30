# GenAI News

A controlled multi-agent GenAI news application built around an orchestrator architecture.

The project is designed to support a complete AI-assisted news workflow:

**News Discovery → Research → Verification → Ranking → Content Generation → Visual Generation → Human Approval → Publishing**

The system is developed incrementally. Infrastructure, deterministic news processing, AI orchestration, evaluation, content generation, and publishing are introduced in separate phases so that each layer is validated before the next is added.

---

## Development Status

### Phase 0: Foundation & Infrastructure ✅ Complete

Phase 0 established the production-oriented application and infrastructure foundation.

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
- OpenTelemetry tracing foundation
- API and worker health/readiness checks
- Unit and integration testing
- Infrastructure smoke testing
- Local Docker environment
- Automated database migration service
- GitHub Actions CI pipeline
- Dependency failure and recovery validation

Phase 0 intentionally introduced no news-processing or AI behavior.

### Phase 1: News Ingestion & Normalization ✅ Complete

Phase 1 introduced the first production application behavior: a deterministic news discovery pipeline.

Completed capabilities include:

- provider-neutral news source contracts
- GNews integration
- RSS feed integration
- article boundary validation
- article normalization
- canonical URL normalization
- configurable freshness policy
- deterministic article deduplication
- PostgreSQL article persistence
- idempotent article upserts
- BullMQ news discovery jobs
- retryable and terminal failure classification
- retry and recovery behavior
- partial-persistence recovery
- discovery API
- article inspection API
- minimal frontend news inspection surface
- Prometheus metrics
- structured discovery events
- OpenTelemetry discovery spans
- deterministic Phase 1 evaluation corpus
- regression evaluation baseline
- failure/recovery validation matrix
- end-to-end PostgreSQL and Redis integration validation
- clean-runner CI validation

Phase 1 remains intentionally deterministic.

**No LLM-based research, verification, ranking, content generation, image generation, autonomous agents, or publishing behavior is implemented yet.**

---

## Current Architecture

```text
                         ┌─────────────────────┐
                         │      Next.js        │
                         │        Web          │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │      Fastify        │
                         │        API          │
                         └───────┬─────┬───────┘
                                 │     │
                    Article Read │     │ Discovery Job
                                 │     ▼
                                 │   Redis / BullMQ
                                 │          │
                                 │          ▼
                                 │   ┌──────────────┐
                                 │   │    Worker    │
                                 │   └──────┬───────┘
                                 │          │
                                 │          ▼
                                 │   News Source Tools
                                 │     ├── GNews
                                 │     └── RSS
                                 │          │
                                 │          ▼
                                 │   Normalize
                                 │          │
                                 │          ▼
                                 │   Freshness Filter
                                 │          │
                                 │          ▼
                                 │   Deduplicate
                                 │          │
                                 │          ▼
                                 └────► PostgreSQL
```

Phase 1 deliberately keeps news processing deterministic.

Future AI agents will consume the validated news layer rather than owning ingestion, normalization, persistence, or queue infrastructure.

---

## Monorepo

```text
genai-news/
│
├── apps/
│   ├── web/              # Next.js frontend
│   ├── api/              # Fastify API
│   └── worker/           # BullMQ background worker
│
├── packages/
│   ├── schemas/          # Cross-service schemas and job contracts
│   ├── database/         # Prisma and PostgreSQL access
│   ├── queue/            # Redis and BullMQ infrastructure
│   ├── observability/    # Logging, metrics, and tracing
│   ├── shared/           # Deterministic news domain logic
│   ├── tools/            # External news source integrations
│   ├── evals/            # Deterministic evaluation infrastructure
│   └── agents/           # Multi-agent implementations in later phases
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

Phase 1 provides a minimal inspection surface for the deterministic news pipeline.

Current responsibilities include:

- application frontend foundation
- discovery interaction
- persisted article inspection
- production build validation

The complete research, verification, content review, human approval, and publishing dashboard will be introduced in later phases.

### `apps/api`

Fastify + TypeScript API.

Current responsibilities include:

- environment validation
- application lifecycle
- centralized error handling
- structured logging
- PostgreSQL connectivity
- Redis connectivity
- news discovery requests
- BullMQ job enqueueing
- persisted article retrieval
- Prometheus metrics exposure
- OpenTelemetry instrumentation
- liveness and readiness checks

Core endpoints include:

```text
GET  /health/live
GET  /health/ready
GET  /metrics

POST /api/news/discover
GET  /api/news/articles
```

News discovery requests are validated at the API boundary and converted into typed BullMQ jobs.

Queue failures remain API failures; worker retry behavior only begins after a job has successfully entered the queue.

### `apps/worker`

Dedicated BullMQ background worker.

Current responsibilities include:

- news discovery job consumption
- source adapter execution
- normalization
- freshness filtering
- deterministic deduplication
- article persistence
- retry handling
- terminal failure handling
- structured discovery events
- discovery metrics
- OpenTelemetry job spans
- worker liveness/readiness checks

The worker coordinates deterministic application behavior but does not contain provider-specific parsing or duplicate the shared news-domain rules.

---

## News Discovery Pipeline

Phase 1 introduced the following deterministic processing pipeline:

```text
Discovery Request
       │
       ▼
BullMQ Job
       │
       ▼
Source Adapter
(GNews / RSS)
       │
       ▼
Boundary Validation
       │
       ▼
Normalization
       │
       ▼
Canonical URL Processing
       │
       ▼
Freshness Policy
       │
       ▼
Deterministic Deduplication
       │
       ▼
PostgreSQL Persistence
```

Each stage has a defined responsibility and is independently testable.

### Source Adapters

External news providers are isolated behind provider-neutral source contracts.

Implemented sources:

- GNews
- RSS

Provider-specific payloads do not propagate through the rest of the application.

### Normalization

Raw source articles are converted into a shared normalized article representation.

Normalization validates:

- source structure
- article structure
- title
- URL
- publication timestamp

Malformed articles are rejected with deterministic rejection reasons.

### Canonical URLs

Article URLs are normalized before persistence and deduplication.

Canonicalization includes:

- HTTP/HTTPS validation
- fragment removal
- tracking parameter removal
- deterministic query parameter ordering

Tracking parameters such as common campaign and click identifiers do not create separate article identities.

### Freshness

Articles are evaluated against an explicit freshness policy.

The policy handles:

- maximum article age
- future timestamp skew
- missing publication timestamps

Possible classifications include:

```text
fresh
stale
missing-published-at
future-published-at
```

### Deduplication

Phase 1 uses deterministic ordered deduplication.

Duplicate keys are evaluated using:

```text
1. source + external ID
2. canonical URL
3. publisher + normalized title
```

Only accepted unique representatives register deduplication keys, preventing unintended transitive merges.

### Persistence

Accepted unique articles are persisted to PostgreSQL.

Canonical URL acts as the persistence-level idempotency boundary.

Repeated discovery and retry execution therefore update the existing article rather than creating duplicate rows.

This also protects recovery after partial persistence.

---

## Shared Packages

### `@genai-news/schemas`

Typed contracts shared across application boundaries.

Includes:

- queue job schemas
- news discovery job contracts
- cross-service validation

### `@genai-news/database`

Shared PostgreSQL infrastructure using Prisma.

Provides:

- Prisma schema
- generated client
- migrations
- database connectivity
- health checks
- article repository
- idempotent article persistence

### `@genai-news/queue`

Shared Redis and BullMQ infrastructure.

Provides:

- Redis connection configuration
- queue definitions
- typed producers
- worker connection strategy
- queue health checks
- discovery job configuration
- retry/backoff configuration

News discovery jobs currently use bounded retry behavior with exponential backoff.

### `@genai-news/observability`

Shared observability infrastructure.

Provides:

- Pino structured logging
- structured application events
- service metadata
- Prometheus metrics
- OpenTelemetry initialization
- tracing helpers
- request/job correlation
- discovery instrumentation

### `@genai-news/shared`

Shared deterministic news-domain logic.

Provides:

- news contracts
- article validation
- text normalization
- URL normalization
- article normalization
- freshness policy
- deduplication keys
- deterministic article deduplication

This package contains pure application logic where possible and does not depend on infrastructure.

### `@genai-news/tools`

External capability integrations.

Phase 1 currently provides:

- GNews source adapter
- RSS source adapter
- typed source errors
- provider-neutral source results

Future external integrations will continue to live behind tool boundaries.

### `@genai-news/evals`

Deterministic evaluation and regression infrastructure.

Phase 1 provides:

- fixed news evaluation corpus
- expected normalization outcomes
- canonical URL expectations
- freshness expectations
- deduplication expectations
- final outcome expectations
- aggregate metrics
- regression policy
- validation matrix
- CLI baseline runner

The Phase 1 evaluation layer does not use an LLM judge, embeddings, live news APIs, Redis, or PostgreSQL.

### `@genai-news/agents`

Reserved for the controlled multi-agent architecture introduced in later phases.

Agents will be layered on top of the deterministic ingestion foundation rather than replacing it.

---

## Failure Classification & Recovery

Phase 1 explicitly validates failure behavior instead of treating all failures identically.

Discovery failures are classified as either:

```text
Retryable
Terminal
```

Examples of retryable failures include:

- source timeout
- source network failure
- HTTP 408
- HTTP 429
- HTTP 5xx
- transient persistence failure
- unknown infrastructure failure

Examples of terminal failures include:

- invalid source payload
- invalid JSON/XML
- unsupported source
- invalid job payload
- ordinary non-retryable HTTP 4xx responses

BullMQ retries retryable worker failures using bounded exponential backoff.

Terminal failures are marked unrecoverable and are not repeatedly executed.

The integration suite also verifies recovery after partial persistence without creating duplicate canonical article rows.

---

## Observability

The application provides observability across API and worker orchestration boundaries.

### Structured Logging

Structured logs contain contextual metadata such as:

```text
service
environment
requestId
jobId
jobName
sourceId
failureReason
retryable
```

Discovery lifecycle events include events for:

- discovery requested
- enqueue failure
- discovery completion
- discovery failure

### Metrics

Prometheus metrics cover:

- discovery enqueue outcomes
- enqueue duration
- worker job outcomes
- worker job duration
- discovery stage counts
- discovery stage duration

Metric labels are intentionally kept low-cardinality.

Metrics are exposed through:

```text
GET /metrics
```

### Tracing

OpenTelemetry instrumentation provides spans around API and worker orchestration.

Worker failure spans record failure classification before the error propagates.

The API enqueue operation and worker execution are currently separate trace boundaries.

`jobId` provides cross-service correlation.

Distributed BullMQ trace-context propagation is not claimed in the current implementation.

---

## Evaluation

Phase 1 includes a deterministic regression baseline for the news-processing pipeline.

The baseline uses:

- a fixed corpus
- a fixed clock
- a fixed freshness policy
- deterministic expected outcomes

It evaluates:

```text
Normalization
Canonical URL handling
Freshness
Deduplication
Final article outcome
```

Current Phase 1 baseline:

```text
Corpus: phase1-baseline-v1

Cases:            17/17 passed
Pass rate:        100.00%
Normalization:    100.00%
Canonical URL:    100.00%
Freshness:        100.00%
Deduplication:    100.00%
Final outcome:    100.00%

REGRESSION: PASS
```

This evaluation suite is intentionally separate from ordinary unit tests.

Unit tests verify individual behavior.

The evaluation baseline verifies that the complete deterministic news-processing policy continues to produce the expected outcomes as the system evolves.

---

## Testing

The repository uses multiple validation layers.

### Unit Tests

Vitest tests cover:

- schemas
- normalization
- canonical URLs
- freshness
- deduplication
- source adapters
- queue behavior
- API behavior
- worker behavior
- observability
- failure classification
- evaluation infrastructure

### Integration Tests

Integration tests exercise real PostgreSQL and Redis boundaries.

Validated flows include:

- API → PostgreSQL
- API → Redis
- API → BullMQ
- BullMQ → Worker
- Worker → news pipeline
- Worker → PostgreSQL
- successful discovery
- source retry and recovery
- persistence retry and recovery
- partial-persistence replay
- idempotent persistence

### Failure Validation

Phase 1 explicitly validates:

- source network failures
- source timeout behavior
- retryable HTTP failures
- terminal HTTP failures
- malformed provider responses
- queue unavailability
- transient persistence failures
- retry behavior
- partial persistence
- replay idempotency

---

## Infrastructure

The application uses PostgreSQL and Redis as its core infrastructure dependencies.

```text
Web
 │
 ▼
API
 ├──────────────► PostgreSQL
 │
 └──────────────► Redis / BullMQ
                        │
                        ▼
                     Worker
                        │
                        ▼
                   News Sources
```

Docker infrastructure supports:

- `web`
- `api`
- `worker`
- `postgres`
- `redis`
- `migrate`

The migration service applies Prisma migrations before dependent application services become available.

Service readiness remains dependency-aware:

- API readiness requires PostgreSQL and Redis
- Worker readiness requires Redis
- liveness remains independent of dependency readiness

---

## Continuous Integration

GitHub Actions validates the repository from a clean environment.

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
   ↓
Migration Validation
   ↓
Container Validation
   ↓
Security / Dependency Checks
```

CI provisions PostgreSQL and Redis for infrastructure-dependent integration tests.

The Phase 1 baseline has been validated successfully on clean CI runners.

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
| News Sources          | GNews, RSS              |
| Logging               | Pino                    |
| Metrics               | Prometheus              |
| Telemetry             | OpenTelemetry           |
| Testing               | Vitest                  |
| Containers            | Docker / Docker Compose |
| CI                    | GitHub Actions          |

---

## Phase 1 Baseline

Phase 1 has been validated across:

- formatting
- linting
- TypeScript compilation
- unit tests
- integration tests
- production builds
- PostgreSQL migrations
- Redis connectivity
- BullMQ processing
- GNews ingestion
- RSS ingestion
- article normalization
- canonical URL processing
- freshness filtering
- deterministic deduplication
- idempotent persistence
- retry behavior
- terminal failure behavior
- source failure recovery
- persistence failure recovery
- partial-persistence recovery
- queue-unavailable behavior
- structured logging
- Prometheus metrics
- OpenTelemetry tracing
- deterministic regression evaluation
- clean-runner GitHub Actions CI

This forms the stable deterministic news-ingestion boundary for future AI capabilities.

---

## Development Principles

The project follows several architectural constraints:

**Deterministic infrastructure before AI orchestration.**  
Behavior that does not require an LLM remains deterministic and independently testable.

**Tools are separate from agents.**  
External news integrations are implemented as reusable tools. Future agents may call those tools rather than embedding provider logic inside agent implementations.

**Agents do not own infrastructure.**  
Queueing, persistence, normalization, observability, and source integration remain application capabilities outside the agent reasoning layer.

**Evaluation grows with capability.**  
Deterministic behavior receives deterministic regression evaluation. AI-specific evaluation will be introduced when AI behavior exists.

**Human control remains part of the target architecture.**  
Later content-generation and publishing capabilities will preserve explicit approval boundaries where appropriate.

---

## Roadmap

```text
Phase 0  Foundation & Infrastructure       ✅ Complete
Phase 1  News Ingestion & Normalization    ✅ Complete

                ↓

        Future AI Phases

Research
   ↓
Verification
   ↓
Ranking / Selection
   ↓
Content Generation
   ↓
Visual Generation
   ↓
Human Approval
   ↓
Publishing
```

Phase 1 intentionally stops at the deterministic news boundary.

The next development phase will build on this validated ingestion layer rather than modifying its core responsibilities.

AI orchestration libraries such as LangChain/LangGraph will be introduced when agentic reasoning and orchestration require them, while the deterministic tools created in Phase 1 remain reusable application capabilities.
