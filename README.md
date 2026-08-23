# HCMUT SkillBridge

HCMUT SkillBridge is a TypeScript full-stack learning project that helps students discover projects, recruit teammates, collaborate, and turn completed work into portfolio evidence.

The intended product journey is:

```text
Create a profile → Find a project → Apply → Form a team → Collaborate → Review → Portfolio
```

## Project status

Requirements, PostgreSQL invariants, authentication, executable API contracts, the core domain API, the responsive React web MVP, deterministic quality gates, Docker runtime, Socket.IO collaboration, and Redis scaling are operational. Asynchronous workers, mobile, and delivery phases continue through reviewed, short-lived feature branches.

## Planned platform

- React, Tailwind CSS, and Taste Skill for the web experience
- Node.js, Express, and TypeScript for the API
- PostgreSQL for transactional data
- Swagger UI and Postman for API documentation and testing
- Docker and GitHub Actions for reproducible delivery
- Redis, Socket.IO, and RabbitMQ for advanced realtime and asynchronous workflows
- React Native for the mobile client
- Vercel, Neon, and an optional AWS learning deployment

## Development principles

- Start with a modular monolith and earn additional complexity.
- Keep PostgreSQL as the source of truth.
- Protect business invariants with database constraints and transactions.
- Deliver changes through focused pull requests with automated checks.
- Add infrastructure only when it solves a documented product or learning need.

Detailed requirements, architecture diagrams, phase gates, and acceptance criteria are maintained in [PROJECT_PLAN.md](PROJECT_PLAN.md).

## Local development

Requirements:

- Node.js `24.19.0` (see `.nvmrc`)
- npm `11.17.0`
- Docker Desktop or Postgres.app for PostgreSQL

Install dependencies and run both applications:

```bash
npm install
npm run dev
```

Hoặc khởi động API cùng PostgreSQL, Redis và RabbitMQ bằng runtime containers:

```bash
npm run docker:up
npm run docker:seed
```

The initial development endpoints are:

- Web: `http://localhost:5173`
- API health: `http://localhost:3000/health`
- API readiness: `http://localhost:3000/health/ready`
- Redis cache metrics: `http://localhost:3000/health/cache`
- Authentication API: `http://localhost:3000/api/v1/auth`
- Core domain API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/openapi.json`

Run the complete local quality gate:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run openapi:check
npm run security:audit
npm run build
```

## Database development

Khuyến nghị dùng full local stack; PostgreSQL test được tách bằng Compose profile:

```bash
npm run docker:up
npm run docker:test-db
```

Configure `packages/database/.env` from `packages/database/.env.example`, then run:

```bash
npm run db:migrate
npm run db:seed
npm run db:explain
```

Run invariant tests against the test database:

```bash
TEST_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test \
REDIS_URL=redis://:skillbridge-redis@localhost:6379 \
npm run test:integration
```

Postgres.app and pgAdmin 4 setup, the physical ERD, constraint ownership, and migration policy are documented in [docs/database/README.md](docs/database/README.md).

Container topology, migration/seed jobs, environment overrides, image review và troubleshooting được mô tả trong [docs/deployment/docker-local.md](docs/deployment/docker-local.md).

## Authentication API

Phase 4 provides register, login, refresh-token rotation, logout, current-user access, request IDs, consistent errors, and global-role middleware. Configure `apps/api/.env` from `apps/api/.env.example` before starting the API.

The authentication security model is documented in [docs/security/authentication.md](docs/security/authentication.md). OpenAPI and Postman artifacts live under `docs/api/` and `postman/`.

## API contract testing

OpenAPI is generated from the API's Zod validation schemas and route registry. The committed JSON,
Swagger UI instructions, and Postman/Newman workflow are documented in
[docs/api/README.md](docs/api/README.md).

Phase 6 authorization, concurrency, and workflow decisions are documented in
[docs/api/core-domain.md](docs/api/core-domain.md).

```bash
npm run openapi:check
TEST_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test npm run postman:test
```

## React web MVP

The web client implements project discovery, authentication, profile and skill editing, project creation and owner management, applications, lifecycle controls, and the team task board. Configure `apps/web/.env` from `apps/web/.env.example` before running it against another API environment.

The visual direction, responsive breakpoints, state model, and accessibility audit are documented in [docs/design/web-mvp-brief.md](docs/design/web-mvp-brief.md).

## Quality engineering

Unit, component, database integration, Newman contract, and Playwright browser suites protect different parts of the system. Start the test PostgreSQL container before running integration or browser tests:

```bash
TEST_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test npm run test:integration
TEST_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test npm run postman:test
E2E_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test npm run test:e2e
```

Playwright automatically migrates and seeds only a database named `skillbridge_test`. Coverage policy, critical journeys, failure artifacts, and dependency-scanning decisions are documented in [docs/testing/quality-engineering.md](docs/testing/quality-engineering.md).

## Realtime collaboration

The team workspace uses authenticated Socket.IO rooms for durable chat, task events, reconnect recovery, presence, and typing signals. PostgreSQL and REST remain the source of truth. Event contracts, persist-before-broadcast ordering, idempotency, room authorization, and recovery behavior are documented in [docs/realtime/socketio.md](docs/realtime/socketio.md).

Redis provides cache-aside project reads, atomic auth rate limiting, TTL presence, and Socket.IO Pub/Sub across API instances. Keys, invalidation, metrics, sticky sessions, and failure behavior are documented in [docs/realtime/redis.md](docs/realtime/redis.md).
