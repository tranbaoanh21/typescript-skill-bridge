# Database foundation

Phase 3 establishes the PostgreSQL source of truth for authentication, profiles, skills, projects, applications, and memberships.

## Baseline

- PostgreSQL `18.4` for local containers and CI.
- Drizzle ORM `1.0.0-rc.4` with the `pg` driver.
- Version-controlled SQL migrations in `packages/database/drizzle`.
- Pooled `DATABASE_URL` for application traffic and direct `DATABASE_DIRECT_URL` for migrations.
- Neon remains the production target; Postgres.app or Docker can serve local development.

The checked-in migration SQL is the review artifact. `drizzle-kit push` is not part of the shared workflow because it bypasses migration history.

## Local option A: Docker

Start both isolated databases:

```bash
docker compose -f infrastructure/docker/compose.database.yaml up -d --wait
```

| Purpose          | Database URL                                                           |
| ---------------- | ---------------------------------------------------------------------- |
| Development      | `postgresql://skillbridge:skillbridge@localhost:5433/skillbridge`      |
| Integration test | `postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test` |

Copy `packages/database/.env.example` to `packages/database/.env`, then apply the schema and demo data:

```bash
npm run db:migrate
npm run db:seed
```

Stop the containers without deleting the development volume:

```bash
docker compose -f infrastructure/docker/compose.database.yaml down
```

## Local option B: Postgres.app and pgAdmin 4

Start Postgres.app on port `5432`, then create a local role and database from `psql` or pgAdmin Query Tool:

```sql
CREATE ROLE skillbridge WITH LOGIN PASSWORD 'skillbridge';
CREATE DATABASE skillbridge OWNER skillbridge;
```

Use this local-only URL in `packages/database/.env`:

```dotenv
DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5432/skillbridge
DATABASE_DIRECT_URL=postgresql://skillbridge:skillbridge@localhost:5432/skillbridge
DATABASE_POOL_MAX=10
```

Register the same host, port, maintenance database, username, and password in pgAdmin 4. Credentials shown here are only for local development and must never be reused in Neon or another deployed environment.

## Commands

| Command                    | Purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `npm run db:generate`      | Generate a migration after changing `src/schema.ts`    |
| `npm run db:migrate`       | Apply committed migrations using the direct connection |
| `npm run db:seed`          | Upsert deterministic, login-disabled demo data         |
| `npm run db:studio`        | Open Drizzle Studio                                    |
| `npm run db:explain`       | Run the discovery query with `EXPLAIN ANALYZE`         |
| `npm run test:integration` | Prove core invariants against `skillbridge_test`       |

Integration tests refuse to run unless `TEST_DATABASE_URL` points to a database named exactly `skillbridge_test`.

## Constraint ownership

| Invariant                                          | Enforcement                       |
| -------------------------------------------------- | --------------------------------- |
| Normalized, unique email                           | `CHECK` plus `UNIQUE`             |
| Skill level between 1 and 5                        | `CHECK`                           |
| Positive project capacity and version              | `CHECK`                           |
| One pending application per user/project           | Partial unique index              |
| Valid application decision metadata                | `CHECK`                           |
| One membership per user/project                    | Composite primary key             |
| Accepted membership matches its source application | Composite foreign key             |
| Owner is inserted and cannot be removed/demoted    | PostgreSQL triggers               |
| Owner transfer                                     | Disallowed by trigger for MVP     |
| Capacity during concurrent application acceptance  | Phase 6 transaction plus row lock |

Cross-row capacity is deliberately not implemented as a `CHECK`: PostgreSQL checks are intended for values in the current row, while concurrent capacity requires a transaction that locks the project/application state.

## Query-plan checkpoint

After migration and seed, `npm run db:explain` was run for public project discovery. PostgreSQL selected a backward index scan on `projects_discovery_idx` with an index condition on `status = 'RECRUITING'`. This checkpoint confirms the intended `(status, created_at)` access path; performance targets will be repeated with representative data in the quality phase.

## Migration policy

1. Change `packages/database/src/schema.ts`.
2. Run `npm run db:generate`.
3. Review generated SQL and add a custom migration when triggers or other PostgreSQL-specific behavior is required.
4. Recreate or migrate an empty test database.
5. Run seed twice and execute integration tests.
6. Commit schema, migration snapshot, SQL, tests, and ERD together.

See [physical-erd.md](physical-erd.md) for the schema implemented by the migrations.
