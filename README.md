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
- dedicated background worker
- PostgreSQL persistence
- Prisma schema and migrations
- Redis infrastructure
- BullMQ background job processing
- shared cross-service schemas
- structured Pino logging
- request and job correlation
- OpenTelemetry tracing foundation
- API and worker health/readiness checks
- unit and integration testing
- infrastructure smoke testing
- local Docker environment
- automated database migration service
- GitHub Actions CI pipeline
- dependency failure and recovery validation

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

Phase 1 remains the deterministic ingestion foundation.

### Phase 2: Canonical Story Clustering ✅ Complete

Phase 2 introduced canonical story clustering on top of the validated Phase 1 article pipeline.

The goal of Phase 2 is to group multiple articles that report the same underlying event into one stable canonical story while remaining conservative about false merges.

Completed capabilities include:

- story domain contracts and clustering invariants
- labelled Phase 2 story-clustering evaluation corpus
- deterministic story feature extraction
- temporal high-recall candidate generation
- lexical similarity diagnostics
- semantic similarity evaluation
- OpenAI `text-embedding-3-small` semantic embeddings
- frozen semantic match threshold of `0.70`
- incremental representative-based story assignment
- stable seed-based representative policy
- ambiguous multi-match protection
- transitive-bridge protection
- deterministic story identity policy
- PostgreSQL `Story` persistence
- PostgreSQL story-membership persistence and provenance
- idempotent membership assignment
- concurrency-safe seed creation
- competing-assignment conflict protection
- retry-safe clustering after partial progress
- BullMQ clustering workflow integration
- story retrieval API
- minimal story inspection frontend
- story-clustering Prometheus metrics
- structured clustering events
- OpenTelemetry clustering spans
- replay and idempotency validation
- same-article concurrency validation
- competing-assignment concurrency validation
- partial-failure validation
- BullMQ retry/replay validation
- deterministic Phase 2 semantic regression snapshot
- combined Phase 1 + Phase 2 release gate

Frozen Phase 2 v1 semantic policy:

```text
Model:      text-embedding-3-small
Threshold:  0.70

TP: 9
FP: 0
TN: 12
FN: 0

Precision:        1.00
Recall:           1.00
False merge rate: 0.00
False split rate: 0.00
```

Important clustering invariants include:

- one article belongs to at most one active story
- the seed article remains the stable representative in v1
- ambiguous multiple matches do not force a merge
- replay does not create duplicate stories or memberships
- concurrent assignment does not silently reassign an article
- clustering does not perform implicit transitive union
- automatic story splitting is not performed in Phase 2
- clustering failures after article persistence are retry-safe

Phase 2 introduces semantic embeddings for story matching, but does **not** yet introduce LLM-based research agents, verification agents, ranking agents, content-generation agents, autonomous publishing, or social-media publishing.

### Current Development Phase

Phase 2 is complete.

The validated application foundation now provides:

```text
External News Sources
        ↓
Validated Articles
        ↓
Canonical Stories
        ↓
Stable Story Provenance
```

Phase 3 will introduce the first agentic capability on top of these validated deterministic layers.

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
                    Read APIs    │     │ Discovery Job
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
                                 │      Normalize
                                 │          │
                                 │          ▼
                                 │      Freshness
                                 │          │
                                 │          ▼
                                 │      Deduplicate
                                 │          │
                                 │          ▼
                                 │   Persist Article
                                 │          │
                                 │          ▼
                                 │ Candidate Stories
                                 │          │
                                 │          ▼
                                 │ Semantic Compare
                                 │          │
                                 │          ▼
                                 │ Story Assignment
                                 │          │
                                 └────► PostgreSQL
                                       ├── Articles
                                       ├── Stories
                                       └── Story Memberships
```

Phase 1 remains deterministic ingestion infrastructure. Phase 2 adds validated semantic story clustering on top of that foundation.

Future AI agents will consume the validated article and canonical-story layers rather than owning ingestion, normalization, persistence, deduplication, clustering infrastructure, or queue infrastructure.

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
│   ├── shared/           # Deterministic news/story domain logic
│   ├── tools/            # External source and embedding integrations
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

Current responsibilities include:

- application frontend foundation
- discovery interaction
- persisted article inspection
- canonical story inspection
- story membership/provenance inspection
- production build validation

The complete research, verification, ranking, content review, human approval, and publishing dashboard will be introduced in later phases.

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
- canonical story retrieval
- story-detail retrieval with membership provenance
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
GET  /api/news/stories
GET  /api/news/stories/:storyId
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
- story candidate generation
- semantic representative comparison
- incremental story assignment
- story persistence
- membership provenance persistence
- clustering replay/idempotency handling
- retry handling
- terminal failure handling
- structured discovery events
- structured clustering events
- discovery metrics
- story-clustering metrics
- OpenTelemetry discovery spans
- OpenTelemetry clustering spans
- worker liveness/readiness checks

The worker coordinates deterministic and validated application behavior but does not contain provider-specific parsing or duplicate shared news/story-domain rules.

---

## News Discovery & Story Clustering Pipeline

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
PostgreSQL Article Persistence
       │
       ▼
Story Candidate Generation
       │
       ▼
Semantic Representative Comparison
       │
       ▼
Incremental Story Assignment
       │
       ▼
Story + Membership Persistence
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

Phase 1 uses deterministic ordered article deduplication.

Duplicate keys are evaluated using:

```text
1. source + external ID
2. canonical URL
3. publisher + normalized title
```

Only accepted unique representatives register deduplication keys, preventing unintended transitive merges.

### Article Persistence

Accepted unique articles are persisted to PostgreSQL.

Canonical URL acts as the persistence-level idempotency boundary.

Repeated discovery and retry execution therefore update the existing article rather than creating duplicate rows.

This also protects recovery after partial persistence.

### Story Candidate Generation

Phase 2 uses conservative, high-recall candidate generation before semantic comparison.

Candidate generation is temporal and bounded so the semantic comparison stage does not compare every incoming article against every persisted story.

Candidate generation is intentionally a retrieval/filtering step, not a final match decision.

### Semantic Story Matching

Phase 2 compares an incoming article against candidate story representatives using semantic embeddings.

The frozen v1 policy uses:

```text
Model: text-embedding-3-small
Match threshold: 0.70
```

The semantic threshold was selected from the labelled Phase 2 evaluation corpus and frozen into the release baseline.

### Incremental Story Assignment

The clustering algorithm is incremental and representative-based.

Assignment behavior:

```text
0 candidate matches  → seed a new story
1 candidate match    → join the existing story
2+ candidate matches → treat as ambiguous and seed a new story
```

The implementation deliberately avoids connected-components clustering and implicit transitive union.

### Story Identity & Representative Policy

Phase 2 v1 uses a stable seed-based representative.

The representative article does not automatically change as new memberships arrive.

This keeps clustering behavior explainable and prevents story identity drift caused by later articles.

### Story Persistence & Provenance

Canonical stories and article memberships are persisted in PostgreSQL.

Membership provenance records include:

- membership kind (`SEED` or `MATCHED`)
- semantic score
- decision signals
- decision reason
- matched-against article ID
- clustering version

An article can belong to at most one active story.

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
- story repository
- idempotent article persistence
- story persistence
- story-membership persistence
- concurrency conflict recovery
- story list/detail read models

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

News discovery jobs use bounded retry behavior with exponential backoff.

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
- story-clustering instrumentation

### `@genai-news/shared`

Shared deterministic news and story-domain logic.

Provides:

- news contracts
- article validation
- text normalization
- URL normalization
- article normalization
- freshness policy
- deduplication keys
- deterministic article deduplication
- story contracts
- story invariants
- story feature extraction
- candidate generation
- pairwise similarity signals
- frozen story match threshold
- story decision policy
- story assignment policy
- story identity policy

This package contains pure application logic where possible and does not depend on infrastructure.

### `@genai-news/tools`

External capability integrations.

Provides:

- GNews source adapter
- RSS source adapter
- typed source errors
- provider-neutral source results
- OpenAI semantic embedding client

External integrations remain isolated behind reusable tool boundaries.

### `@genai-news/evals`

Deterministic evaluation and regression infrastructure.

Provides:

- Phase 1 fixed news evaluation corpus
- Phase 1 regression evaluator
- Phase 2 labelled story-clustering corpus
- lexical similarity diagnostics
- informative/distinctive-token diagnostics
- semantic similarity analysis
- frozen Phase 2 semantic snapshot
- frozen Phase 2 release baseline
- deterministic Phase 2 regression evaluator
- combined Phase 1 + Phase 2 release gate

The Phase 2 release gate does not require a live OpenAI call. It evaluates the committed semantic snapshot deterministically.

### `@genai-news/agents`

Reserved for the controlled multi-agent architecture introduced in Phase 3 and later.

Agents will be layered on top of the validated ingestion and canonical-story foundations rather than replacing them.

---

## Failure Classification, Recovery & Concurrency

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
- transient clustering failure
- unknown infrastructure failure

Examples of terminal failures include:

- invalid source payload
- invalid JSON/XML
- unsupported source
- invalid job payload
- ordinary non-retryable HTTP 4xx responses

BullMQ retries retryable worker failures using bounded exponential backoff.

Terminal failures are marked unrecoverable and are not repeatedly executed.

Phase 2 extends recovery guarantees beyond article persistence:

- retries after partial article persistence remain idempotent
- retries after partial clustering remain idempotent
- previously assigned articles short-circuit on replay
- concurrent seed creation converges on one persisted winner
- competing assignments cannot silently redirect an article to a different story
- persistence conflicts remain explicit instead of weakening invariants

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
storyId
articleId
failureReason
retryable
```

Discovery lifecycle events include:

- discovery requested
- enqueue failure
- discovery completion
- discovery failure

Story-clustering lifecycle events include:

- `story.clustering.already_assigned`
- `story.clustering.assigned_existing_story`
- `story.clustering.seeded_new_story`
- `story.clustering.failed`

### Metrics

Prometheus metrics cover:

- discovery enqueue outcomes
- enqueue duration
- worker job outcomes
- worker job duration
- discovery stage counts
- discovery stage duration
- story clustering outcomes
- candidate counts
- semantic comparison counts
- clustering duration
- candidate-generation duration
- semantic-comparison duration

Story-clustering metrics include:

```text
genai_news_story_clustering_attempts_total
genai_news_story_candidates_total
genai_news_story_semantic_comparisons_total
genai_news_story_clustering_duration_seconds
genai_news_story_candidate_generation_duration_seconds
genai_news_story_semantic_comparison_duration_seconds
```

Metric labels are intentionally kept low-cardinality.

Metrics are exposed through:

```text
GET /metrics
```

### Tracing

OpenTelemetry instrumentation provides spans around API, discovery, and story-clustering orchestration.

Story-clustering spans include:

```text
story.cluster
story.candidate_generation
story.semantic_comparison
```

Worker failure spans record failure classification before the error propagates.

The API enqueue operation and worker execution remain separate trace boundaries.

`jobId` provides cross-service correlation.

Distributed BullMQ trace-context propagation is not claimed in the current implementation.

---

## Evaluation

### Phase 1 Regression Baseline

Phase 1 includes a deterministic regression baseline for the news-processing pipeline.

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

### Phase 2 Story-Clustering Evaluation

Phase 2 uses a labelled story-clustering corpus containing same-story and different-story pairs, including difficult boundaries such as:

- same company, different events
- same person, different events
- same keywords, different events
- primary event vs related event
- release vs integration
- transitive bridge protection
- ordering stability
- incremental replay

The frozen semantic v1 policy evaluates 21 labelled pairs:

```text
Same-story pairs:      9
Different-story pairs: 12

Threshold: 0.70

TP: 9
FP: 0
TN: 12
FN: 0

Precision:        1.00
Recall:           1.00
False merge rate: 0.00
False split rate: 0.00
```

### Phase 2 Release Gate

Phase 2 has a deterministic combined release gate:

```bash
pnpm --filter @genai-news/evals phase2:release
```

Expected release result:

```text
Phase 2 Release Gate

Phase 1
  Corpus: phase1-baseline-v1
  Cases: 17/17
  Regression: PASS

Phase 2
  Baseline: phase2-release-v1
  Corpus: phase2-story-clustering-v1
  Model: text-embedding-3-small
  Threshold: 0.7
  Metrics: TP=9 FP=0 TN=12 FN=0
  Regression: PASS

PHASE 2 RELEASE GATE: PASS
```

The committed semantic snapshot is used for deterministic regression validation. Live OpenAI embedding calls are not required for normal release-gate execution.

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
- story contracts and invariants
- feature extraction
- candidate generation
- similarity signals
- semantic threshold behavior
- assignment policy
- identity policy
- source adapters
- embedding client behavior
- queue behavior
- API behavior
- worker behavior
- observability
- failure classification
- evaluation infrastructure
- release baseline and release gate

### Integration Tests

Integration tests exercise real PostgreSQL and Redis boundaries.

Validated flows include:

- API → PostgreSQL
- API → Redis
- API → BullMQ
- BullMQ → Worker
- Worker → news pipeline
- Worker → PostgreSQL
- article persistence
- story persistence
- story retrieval
- successful discovery
- source retry and recovery
- persistence retry and recovery
- partial-persistence replay
- transient clustering retry and recovery
- same-article concurrency
- competing story assignment
- replay idempotency

Current key integration baselines:

```text
Database integration: 25/25
API integration:       8/8
Worker integration:    23/23
```

### Failure & Concurrency Validation

Phase 2 explicitly validates:

- source network failures
- source timeout behavior
- retryable HTTP failures
- terminal HTTP failures
- malformed provider responses
- queue unavailability
- transient article-persistence failures
- transient story-persistence failures
- semantic comparison failures
- retry behavior
- partial persistence
- partial clustering
- replay idempotency
- concurrent seed creation
- competing concurrent assignment
- BullMQ retry/replay behavior

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
                         ├──► News Sources
                         │
                         └──► OpenAI Embeddings
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

Phase 1 remains protected by its deterministic regression baseline.

Phase 2 adds its own deterministic release baseline and combined release gate.

---

## Technology Stack

| Area                  | Technology                      |
| --------------------- | ------------------------------- |
| Monorepo              | pnpm workspaces                 |
| Language              | TypeScript                      |
| Runtime               | Node.js 24                      |
| Frontend              | Next.js                         |
| API                   | Fastify                         |
| Validation            | Zod                             |
| Database              | PostgreSQL                      |
| ORM                   | Prisma                          |
| Cache / Queue Backend | Redis                           |
| Background Jobs       | BullMQ                          |
| News Sources          | GNews, RSS                      |
| Semantic Embeddings   | OpenAI `text-embedding-3-small` |
| Logging               | Pino                            |
| Metrics               | Prometheus                      |
| Telemetry             | OpenTelemetry                   |
| Testing               | Vitest                          |
| Containers            | Docker / Docker Compose         |
| CI                    | GitHub Actions                  |

---

## Phase 2 Release Baseline

Phase 2 has been validated across:

- formatting
- linting
- TypeScript compilation
- package-scoped unit tests
- database integration tests
- API integration tests
- worker integration tests
- production builds
- PostgreSQL story persistence
- story membership provenance
- semantic clustering
- replay idempotency
- concurrency safety
- retry behavior
- partial-persistence recovery
- partial-clustering recovery
- BullMQ retry/replay behavior
- story API retrieval
- frontend story inspection
- structured logging
- Prometheus metrics
- OpenTelemetry tracing
- Phase 1 regression protection
- deterministic Phase 2 semantic regression
- combined Phase 1 + Phase 2 release validation

This forms the stable article-and-story boundary for future agentic capabilities.

---

## Development Principles

The project follows several architectural constraints:

**Deterministic infrastructure before AI orchestration.**  
Behavior that does not require an LLM remains deterministic and independently testable.

**Tools are separate from agents.**  
External news integrations and embedding capabilities are implemented as reusable tools. Future agents may call those tools rather than embedding provider logic inside agent implementations.

**Agents do not own infrastructure.**  
Queueing, persistence, normalization, observability, source integration, deduplication, and story clustering remain application capabilities outside the agent reasoning layer.

**Evaluation grows with capability.**  
Deterministic behavior receives deterministic regression evaluation. Semantic behavior receives frozen reproducible evaluation. Agent-specific evaluation will be introduced when agentic behavior exists.

**Conservative clustering over aggressive merging.**  
When evidence is ambiguous, the system prefers a new story over an unsafe merge.

**Human control remains part of the target architecture.**  
Later content-generation and publishing capabilities will preserve explicit approval boundaries where appropriate.

---

## Roadmap

```text
Phase 0  Foundation & Infrastructure             ✅ Complete
Phase 1  News Ingestion & Normalization          ✅ Complete
Phase 2  Canonical Story Clustering              ✅ Complete

                ↓

Phase 3  Research Agent / Agentic Research
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

Phase 2 intentionally stops at the validated canonical-story boundary.

Phase 3 will introduce the first agentic capability on top of the stable article and story layers rather than modifying their core responsibilities.

LangChain/LangGraph will be introduced when agentic reasoning and orchestration require them, while deterministic tools and validated story infrastructure remain reusable application capabilities.
