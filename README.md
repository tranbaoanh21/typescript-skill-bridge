# HCMUT SkillBridge

HCMUT SkillBridge is a TypeScript full-stack learning project that helps students discover projects, recruit teammates, collaborate, and turn completed work into portfolio evidence.

The intended product journey is:

```text
Create a profile → Find a project → Apply → Form a team → Collaborate → Review → Portfolio
```

## Project status

The TypeScript monorepo and PostgreSQL foundation are operational. Core MVP implementation is proceeding through reviewed, short-lived feature branches.

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

The initial development endpoints are:

- Web: `http://localhost:5173`
- API health: `http://localhost:3000/health`
- API readiness: `http://localhost:3000/health/ready`
- Authentication API: `http://localhost:3000/api/v1/auth`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/openapi.json`

Run the complete local quality gate:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Database development

Start isolated PostgreSQL 18.4 dev and test databases:

```bash
docker compose -f infrastructure/docker/compose.database.yaml up -d --wait
```

Configure `packages/database/.env` from `packages/database/.env.example`, then run:

```bash
npm run db:migrate
npm run db:seed
npm run db:explain
```

Run invariant tests against the test database:

```bash
TEST_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test npm run test:integration
```

Postgres.app and pgAdmin 4 setup, the physical ERD, constraint ownership, and migration policy are documented in [docs/database/README.md](docs/database/README.md).

## Authentication API

Phase 4 provides register, login, refresh-token rotation, logout, current-user access, request IDs, consistent errors, and global-role middleware. Configure `apps/api/.env` from `apps/api/.env.example` before starting the API.

The authentication security model is documented in [docs/security/authentication.md](docs/security/authentication.md). OpenAPI and Postman artifacts live under `docs/api/` and `postman/`.

## API contract testing

OpenAPI is generated from the API's Zod validation schemas and route registry. The committed JSON,
Swagger UI instructions, and Postman/Newman workflow are documented in
[docs/api/README.md](docs/api/README.md).

```bash
npm run openapi:check
TEST_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test npm run postman:test
```
