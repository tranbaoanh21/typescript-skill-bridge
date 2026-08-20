# API contracts

The API contract is generated from the Zod schemas and route registry in
`apps/api/src/docs/openapi.ts`.

## Local documentation

1. Copy `apps/api/.env.example` to `apps/api/.env` and keep `ENABLE_API_DOCS=true`.
2. Start PostgreSQL and run the API with `npm run dev:api`.
3. Open `http://localhost:3000/docs` for Swagger UI or
   `http://localhost:3000/docs/openapi.json` for the JSON contract.

Use `npm run openapi:generate` after changing a documented schema or endpoint. CI runs
`npm run openapi:check` to validate OpenAPI 3.1 and reject a stale committed artifact.

## Postman and Newman

Import the collection and one environment from `postman/`. Local secrets and runtime tokens are
collection/environment variables and must not be committed with real values.

With the test PostgreSQL container running and migrated, execute:

```bash
TEST_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test \
  npm run postman:test
```

The runner starts the API on an ephemeral loopback port, executes the collection, removes its test
account, and closes the database pool. Newman is intentionally a development-only dependency. Its
current dependency tree has known advisories, so it must never ship in the production image; use
`npm audit --omit=dev` to assess deployable dependencies separately.
