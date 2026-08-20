import { randomUUID } from 'node:crypto';

import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for database integration tests.');
}

const databaseName = new URL(testDatabaseUrl).pathname.slice(1);

if (databaseName !== 'skillbridge_test') {
  throw new Error(
    `Refusing to run destructive integration tests against database ${databaseName}.`,
  );
}

const pool = new Pool({ connectionString: testDatabaseUrl, max: 4 });

type PostgreSqlError = Error & {
  code?: string;
  constraint?: string;
};

const captureDatabaseError = async (operation: Promise<unknown>) => {
  try {
    await operation;
  } catch (error) {
    return error as PostgreSqlError;
  }

  throw new Error('Expected PostgreSQL to reject the operation.');
};

const inRollbackTransaction = async (test: (client: PoolClient) => Promise<void>) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await test(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
};

const insertUser = async (client: PoolClient, email = `${randomUUID()}@example.com`) => {
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, '!integration-test-login-disabled!')
     RETURNING id`,
    [email],
  );

  return result.rows[0]!.id;
};

const insertProject = async (client: PoolClient, ownerId: string, capacity = 3) => {
  const result = await client.query<{ id: string }>(
    `INSERT INTO projects (owner_id, slug, title, description, capacity)
     VALUES ($1, $2, 'Invariant test project', 'Created inside a rolled-back test.', $3)
     RETURNING id`,
    [ownerId, `project-${randomUUID()}`, capacity],
  );

  return result.rows[0]!.id;
};

beforeAll(async () => {
  await pool.query('SELECT 1 FROM drizzle.__drizzle_migrations LIMIT 1');
});

afterAll(async () => {
  await pool.end();
});

describe('PostgreSQL core invariants', () => {
  it('rejects email values that are not normalized', async () => {
    await inRollbackTransaction(async (client) => {
      const error = await captureDatabaseError(
        client.query(
          `INSERT INTO users (email, password_hash)
           VALUES ('Student@Example.com', '!integration-test-login-disabled!')`,
        ),
      );

      expect(error).toMatchObject({ code: '23514', constraint: 'users_email_normalized_check' });
    });
  });

  it('rejects a project with zero capacity', async () => {
    await inRollbackTransaction(async (client) => {
      const ownerId = await insertUser(client);
      const error = await captureDatabaseError(insertProject(client, ownerId, 0));

      expect(error).toMatchObject({ code: '23514', constraint: 'projects_capacity_check' });
    });
  });

  it('automatically creates and protects the owner membership', async () => {
    await inRollbackTransaction(async (client) => {
      const ownerId = await insertUser(client);
      const projectId = await insertProject(client, ownerId);
      const membership = await client.query<{ project_role: string }>(
        `SELECT project_role
         FROM project_members
         WHERE project_id = $1 AND user_id = $2`,
        [projectId, ownerId],
      );

      expect(membership.rows).toEqual([{ project_role: 'OWNER' }]);

      const error = await captureDatabaseError(
        client.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [
          projectId,
          ownerId,
        ]),
      );
      expect(error).toMatchObject({
        code: '23514',
        constraint: 'project_members_owner_required',
      });
    });
  });

  it('allows project deletion to cascade its owner membership', async () => {
    await inRollbackTransaction(async (client) => {
      const ownerId = await insertUser(client);
      const projectId = await insertProject(client, ownerId);
      const result = await client.query('DELETE FROM projects WHERE id = $1', [projectId]);

      expect(result.rowCount).toBe(1);
    });
  });

  it('rejects assigning OWNER role to a different user', async () => {
    await inRollbackTransaction(async (client) => {
      const ownerId = await insertUser(client);
      const otherUserId = await insertUser(client);
      const projectId = await insertProject(client, ownerId);
      const error = await captureDatabaseError(
        client.query(
          `INSERT INTO project_members (project_id, user_id, project_role)
           VALUES ($1, $2, 'OWNER')`,
          [projectId, otherUserId],
        ),
      );

      expect(error).toMatchObject({
        code: '23514',
        constraint: 'project_members_owner_matches_project',
      });
    });
  });

  it('rejects changing a project owner directly', async () => {
    await inRollbackTransaction(async (client) => {
      const ownerId = await insertUser(client);
      const otherUserId = await insertUser(client);
      const projectId = await insertProject(client, ownerId);
      const error = await captureDatabaseError(
        client.query('UPDATE projects SET owner_id = $1 WHERE id = $2', [otherUserId, projectId]),
      );

      expect(error).toMatchObject({ code: '23514', constraint: 'projects_owner_immutable' });
    });
  });

  it('allows only one pending application per user and project', async () => {
    await inRollbackTransaction(async (client) => {
      const ownerId = await insertUser(client);
      const applicantId = await insertUser(client);
      const projectId = await insertProject(client, ownerId);

      await client.query(
        `INSERT INTO project_applications (project_id, applicant_id, cover_letter)
         VALUES ($1, $2, 'First pending application')`,
        [projectId, applicantId],
      );
      const error = await captureDatabaseError(
        client.query(
          `INSERT INTO project_applications (project_id, applicant_id, cover_letter)
           VALUES ($1, $2, 'Second pending application')`,
          [projectId, applicantId],
        ),
      );

      expect(error).toMatchObject({
        code: '23505',
        constraint: 'project_applications_one_pending_idx',
      });
    });
  });

  it('permits a new application after the previous one was withdrawn', async () => {
    await inRollbackTransaction(async (client) => {
      const ownerId = await insertUser(client);
      const applicantId = await insertUser(client);
      const projectId = await insertProject(client, ownerId);

      await client.query(
        `INSERT INTO project_applications
           (project_id, applicant_id, cover_letter, status, decided_at)
         VALUES ($1, $2, 'Withdrawn application', 'WITHDRAWN', now())`,
        [projectId, applicantId],
      );
      const result = await client.query(
        `INSERT INTO project_applications (project_id, applicant_id, cover_letter)
         VALUES ($1, $2, 'New pending application')`,
        [projectId, applicantId],
      );

      expect(result.rowCount).toBe(1);
    });
  });

  it('requires decision metadata for accepted applications', async () => {
    await inRollbackTransaction(async (client) => {
      const ownerId = await insertUser(client);
      const applicantId = await insertUser(client);
      const projectId = await insertProject(client, ownerId);
      const error = await captureDatabaseError(
        client.query(
          `INSERT INTO project_applications
             (project_id, applicant_id, cover_letter, status)
           VALUES ($1, $2, 'Invalid accepted application', 'ACCEPTED')`,
          [projectId, applicantId],
        ),
      );

      expect(error).toMatchObject({
        code: '23514',
        constraint: 'project_applications_decision_check',
      });
    });
  });

  it('requires a membership source to match the accepted applicant and project', async () => {
    await inRollbackTransaction(async (client) => {
      const ownerId = await insertUser(client);
      const applicantId = await insertUser(client);
      const differentUserId = await insertUser(client);
      const projectId = await insertProject(client, ownerId);
      const application = await client.query<{ id: string }>(
        `INSERT INTO project_applications
           (project_id, applicant_id, cover_letter, status, decided_at, decided_by)
         VALUES ($1, $2, 'Accepted application', 'ACCEPTED', now(), $3)
         RETURNING id`,
        [projectId, applicantId, ownerId],
      );
      const error = await captureDatabaseError(
        client.query(
          `INSERT INTO project_members
             (project_id, user_id, project_role, source_application_id)
           VALUES ($1, $2, 'MEMBER', $3)`,
          [projectId, differentUserId, application.rows[0]!.id],
        ),
      );

      expect(error).toMatchObject({
        code: '23503',
        constraint: 'project_members_application_identity_fk',
      });
    });
  });
});
