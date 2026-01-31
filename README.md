# Pub/Sub & Worker Queues — Monorepo

Same monorepo pattern as the Fastify WMS, wired for testing **Redis Pub/Sub** and **BullMQ worker queues**.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        APPS                                  │
│                                                              │
│  ┌──────────────┐              ┌──────────────┐             │
│  │   apps/api   │              │ apps/worker   │             │
│  │   (Fastify)  │              │  (BullMQ)     │             │
│  │              │              │               │             │
│  │  Routes      │   enqueue    │  Processors   │             │
│  │  Actions ────┼──────────────┼─► processTask │             │
│  │              │              │  processNotif  │             │
│  └──────┬───────┘              └───────┬───────┘             │
│         │                              │                     │
│         │ publish ◄────────────────────┤ publish             │
│         │         ────────────────────►│ subscribe           │
│         │           Redis Pub/Sub      │                     │
├─────────┼──────────────────────────────┼─────────────────────┤
│         │        PACKAGES              │                     │
│         ▼                              ▼                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ @wms/domain │  │ @wms/queue  │  │ @wms/pubsub │         │
│  │  Services   │  │  BullMQ     │  │  Redis P/S  │         │
│  └──────┬──────┘  └─────────────┘  └─────────────┘         │
│         │                                                    │
│  ┌──────┴──────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  @wms/db    │  │ @wms/types  │  │ @wms/config │         │
│  │  Prisma     │  │  Zod        │  │  Env        │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## Request Lifecycle

```
1. POST /api/tasks  { name: "generate-report", priority: "high" }
   │
2. API validates with @wms/types (CreateTaskSchema)
   │
3. Domain service persists to DB via @wms/db
   │
4. Domain service enqueues job via @wms/queue (BullMQ)
   │
5. Domain service publishes event via @wms/pubsub (Redis)
   │
6. Response: { success: true, data: { id, status: "pending" } }
   │
   └──────────────────────────────────┐
                                      ▼
7. Worker picks up job from BullMQ
   │
8. Worker processes task (with progress updates)
   │
9. Worker publishes events → API + Worker both receive
   │
10. Worker marks task completed in DB
```

## Getting Started

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Push database schema
pnpm db:push

# 4. Generate Prisma client
pnpm db:generate

# 5. Build packages (required first time)
pnpm build

# 6. Start both API and Worker
pnpm dev

# Or start individually:
pnpm dev:api      # Terminal 1
pnpm dev:worker   # Terminal 2
```

## Test It

```bash
# Create a task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"name": "generate-report", "priority": "high"}'

# List tasks
curl http://localhost:3000/api/tasks

# Get specific task
curl http://localhost:3000/api/tasks/<task-id>

# Health check
curl http://localhost:3000/health
```

## Project Structure

```
pubsub-workers/
├── apps/
│   ├── api/                    # Fastify HTTP server
│   │   └── src/
│   │       ├── actions/        # Request handlers (business orchestration)
│   │       ├── routes/         # Route definitions + validation
│   │       ├── plugins/        # Fastify plugins (auth, etc.)
│   │       ├── app.ts          # Fastify instance + plugin registration
│   │       └── server.ts       # Entry point (env → app → listen)
│   │
│   └── worker/                 # Background job processor
│       └── src/
│           ├── processors/     # Job handler functions
│           └── worker.ts       # Entry point (env → register workers → listen)
│
├── packages/
│   ├── config/                 # Centralized env loading
│   ├── db/                     # Prisma client + repositories
│   ├── domain/                 # Business logic services
│   ├── pubsub/                 # Redis Pub/Sub (real-time events)
│   ├── queue/                  # BullMQ (durable job queues)
│   └── types/                  # Shared Zod schemas + TypeScript types
│
├── docker-compose.yml          # Postgres + Redis
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── .env
```

## Key Concepts

### BullMQ (Worker Queues) vs Redis Pub/Sub

| Feature | BullMQ | Redis Pub/Sub |
|---------|--------|---------------|
| **Durability** | Jobs persist in Redis | Fire-and-forget |
| **Retries** | Built-in with backoff | Manual |
| **Concurrency** | Configurable per worker | N/A |
| **Progress** | `job.updateProgress()` | Manual |
| **Use case** | Background processing | Real-time notifications |

### When to use which?

- **BullMQ**: Tasks that MUST complete — order fulfillment, report generation, email sending
- **Pub/Sub**: Real-time notifications — UI updates, logging, metrics, event broadcasting

Both can (and should) be used together. The task service demonstrates this:
1. Enqueue to BullMQ (guaranteed processing)
2. Publish to Pub/Sub (instant notification that it was enqueued)
