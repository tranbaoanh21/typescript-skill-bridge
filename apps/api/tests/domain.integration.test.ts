import { randomUUID } from 'node:crypto';

import { createDatabaseClient } from '@skillbridge/database';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { DomainService } from '../src/modules/domain/domain.service.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for domain integration tests.');
}

if (new URL(testDatabaseUrl).pathname.slice(1) !== 'skillbridge_test') {
  throw new Error('Refusing to run domain integration tests outside skillbridge_test.');
}

const { database, pool } = createDatabaseClient({
  DATABASE_POOL_MAX: 8,
  DATABASE_URL: testDatabaseUrl,
});
const tokenService = new TokenService({
  accessTokenTtlSeconds: 900,
  audience: 'domain-test-clients',
  issuer: 'skillbridge-domain-tests',
  refreshTokenTtlDays: 30,
  secret: 'domain-integration-secret-with-at-least-32-characters',
});
const app = createApp({
  auth: {
    service: new AuthService(new AuthRepository(database), tokenService),
    tokenService,
  },
  corsOrigin: 'http://localhost:5173',
  domain: { service: new DomainService(pool), tokenService },
  enableRequestLogging: false,
});
const createdEmails: string[] = [];
const password = 'correct-horse-battery-staple';
const domainSkillId = '00000000-0000-4000-8000-000000000199';

const registerUser = async (label: string) => {
  const emailLabel = label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
  const email = `${emailLabel}-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const response = await request(app).post('/api/v1/auth/register').send({
    displayName: label,
    email,
    password,
  });
  expect(response.status).toBe(201);
  return {
    accessToken: response.body.data.tokens.accessToken as string,
    email,
    id: response.body.data.user.id as string,
  };
};

const bearer = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

beforeAll(async () => {
  await pool.query('SELECT 1 FROM drizzle.__drizzle_migrations LIMIT 1');
  await pool.query(
    `INSERT INTO skills (id, slug, name)
     VALUES ($1, 'domain-integration', 'Domain Integration')
     ON CONFLICT (id) DO NOTHING`,
    [domainSkillId],
  );
});

afterEach(async () => {
  if (createdEmails.length === 0) return;
  const emails = createdEmails.splice(0);
  await pool.query(
    `DELETE FROM outbox_events
     WHERE payload->>'applicantId' IN
       (SELECT id::text FROM users WHERE email = ANY($1::text[]))`,
    [emails],
  );
  await pool.query(
    'DELETE FROM projects WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))',
    [emails],
  );
  await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
});

afterAll(async () => {
  await pool.end();
});

describe('core domain API', () => {
  it('runs the profile, project, application, membership, sprint, and task workflow', async () => {
    const owner = await registerUser('Project Owner');
    const applicant = await registerUser('Project Applicant');
    const skills = await request(app).get('/api/v1/skills');
    expect(skills.status).toBe(200);
    const skillId = domainSkillId;
    expect(skills.body.data.skills.some((skill: { id: string }) => skill.id === skillId)).toBe(
      true,
    );

    const profile = await request(app)
      .put('/api/v1/profile/skills')
      .set(bearer(applicant.accessToken))
      .send({ skills: [{ level: 4, skillId }] });
    expect(profile.status).toBe(200);
    expect(profile.body.data.profile.skills).toHaveLength(1);

    const slug = `domain-${randomUUID()}`;
    const created = await request(app)
      .post('/api/v1/projects')
      .set(bearer(owner.accessToken))
      .send({
        capacity: 3,
        description: 'A complete integration project used to verify the core business workflow.',
        requiredSkills: [{ desiredLevel: 3, positions: 1, skillId }],
        slug,
        title: 'Core Domain Integration Project',
      });
    expect(created.status).toBe(201);
    const projectId = created.body.data.project.id as string;

    const managedDraft = await request(app)
      .get(`/api/v1/projects/${projectId}/manage`)
      .set(bearer(owner.accessToken));
    expect(managedDraft.status).toBe(200);
    expect(managedDraft.body.data.project).toMatchObject({ id: projectId, status: 'DRAFT' });

    const hiddenFromApplicant = await request(app)
      .get(`/api/v1/projects/${projectId}/manage`)
      .set(bearer(applicant.accessToken));
    expect(hiddenFromApplicant.status).toBe(404);

    const forbiddenEdit = await request(app)
      .patch(`/api/v1/projects/${projectId}`)
      .set(bearer(applicant.accessToken))
      .send({ title: 'Forbidden edit', version: 1 });
    expect(forbiddenEdit.status).toBe(403);

    const published = await request(app)
      .post(`/api/v1/projects/${projectId}/transitions`)
      .set(bearer(owner.accessToken))
      .send({ action: 'PUBLISH', version: 1 });
    expect(published.status).toBe(200);
    expect(published.body.data.project).toMatchObject({ status: 'RECRUITING', version: 2 });

    const discovery = await request(app).get('/api/v1/projects').query({ search: 'Core Domain' });
    expect(discovery.status).toBe(200);
    expect(
      discovery.body.data.items.some((project: { id: string }) => project.id === projectId),
    ).toBe(true);

    const submitted = await request(app)
      .post(`/api/v1/projects/${projectId}/applications`)
      .set(bearer(applicant.accessToken))
      .send({ coverLetter: 'I can contribute TypeScript and PostgreSQL skills to this project.' });
    expect(submitted.status).toBe(201);
    const applicationId = submitted.body.data.application.id as string;

    const applications = await request(app)
      .get(`/api/v1/projects/${projectId}/applications`)
      .set(bearer(owner.accessToken));
    expect(applications.status).toBe(200);
    expect(applications.body.data.applications).toHaveLength(1);

    const accepted = await request(app)
      .post(`/api/v1/applications/${applicationId}/decision`)
      .set(bearer(owner.accessToken))
      .set('x-request-id', 'domain-accept-correlation')
      .send({ decision: 'ACCEPTED', note: 'Strong fit for the stack.' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.application.status).toBe('ACCEPTED');
    const outbox = await pool.query(
      `SELECT event_type AS "eventType", routing_key AS "routingKey",
              correlation_id AS "correlationId", payload
       FROM outbox_events WHERE aggregate_id = $1`,
      [applicationId],
    );
    expect(outbox.rows[0]).toMatchObject({
      correlationId: 'domain-accept-correlation',
      eventType: 'application.accepted',
      payload: { applicantId: applicant.id, applicationId, projectId },
      routingKey: 'notification.application.accepted',
    });

    const members = await request(app)
      .get(`/api/v1/projects/${projectId}/members`)
      .set(bearer(applicant.accessToken));
    expect(members.status).toBe(200);
    expect(members.body.data.members).toHaveLength(2);

    const sprint = await request(app)
      .post(`/api/v1/projects/${projectId}/sprints`)
      .set(bearer(owner.accessToken))
      .send({ endsOn: '2026-09-07', name: 'Sprint 1', startsOn: '2026-09-01' });
    expect(sprint.status).toBe(201);

    const task = await request(app)
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set(bearer(owner.accessToken))
      .send({
        assigneeIds: [applicant.id],
        priority: 'HIGH',
        sprintId: sprint.body.data.sprint.id,
        title: 'Implement project discovery UI',
      });
    expect(task.status).toBe(201);
    expect(task.body.data.task.assignees[0].userId).toBe(applicant.id);
    const taskId = task.body.data.task.id as string;

    const updated = await request(app)
      .patch(`/api/v1/tasks/${taskId}`)
      .set(bearer(applicant.accessToken))
      .send({ status: 'IN_PROGRESS', version: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.task).toMatchObject({ status: 'IN_PROGRESS', version: 2 });

    const staleUpdate = await request(app)
      .patch(`/api/v1/tasks/${taskId}`)
      .set(bearer(owner.accessToken))
      .send({ status: 'DONE', version: 1 });
    expect(staleUpdate.status).toBe(409);
    expect(staleUpdate.body.error.code).toBe('TASK_VERSION_CONFLICT');
  });

  it('serializes concurrent application decisions and never exceeds capacity', async () => {
    const owner = await registerUser('Race Owner');
    const firstApplicant = await registerUser('Race Applicant One');
    const secondApplicant = await registerUser('Race Applicant Two');
    const slug = `capacity-${randomUUID()}`;
    const project = await request(app)
      .post('/api/v1/projects')
      .set(bearer(owner.accessToken))
      .send({
        capacity: 2,
        description: 'A project with one available membership slot for a concurrency race test.',
        slug,
        title: 'Capacity Race Project',
      });
    const projectId = project.body.data.project.id as string;
    await request(app)
      .post(`/api/v1/projects/${projectId}/transitions`)
      .set(bearer(owner.accessToken))
      .send({ action: 'PUBLISH', version: 1 });

    const [firstApplication, secondApplication] = await Promise.all(
      [firstApplicant, secondApplicant].map((applicant) =>
        request(app)
          .post(`/api/v1/projects/${projectId}/applications`)
          .set(bearer(applicant.accessToken))
          .send({
            coverLetter: 'This cover letter is long enough for the capacity race scenario.',
          }),
      ),
    );

    const decisions = await Promise.all(
      [firstApplication, secondApplication].map((application) =>
        request(app)
          .post(`/api/v1/applications/${application!.body.data.application.id}/decision`)
          .set(bearer(owner.accessToken))
          .send({ decision: 'ACCEPTED' }),
      ),
    );

    expect(decisions.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(decisions.find((response) => response.status === 409)?.body.error.code).toBe(
      'PROJECT_CAPACITY_REACHED',
    );
    const members = await request(app)
      .get(`/api/v1/projects/${projectId}/members`)
      .set(bearer(owner.accessToken));
    expect(members.body.data.members).toHaveLength(2);
  });

  it('allows only admins to moderate users and records an immutable audit event', async () => {
    const admin = await registerUser('Domain Admin');
    const target = await registerUser('Moderated User');
    await pool.query("UPDATE users SET global_role = 'ADMIN' WHERE id = $1", [admin.id]);
    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: admin.email,
      password,
    });
    const adminAccessToken = adminLogin.body.data.tokens.accessToken as string;

    const studentAttempt = await request(app)
      .patch(`/api/v1/admin/users/${target.id}/status`)
      .set(bearer(target.accessToken))
      .send({ status: 'SUSPENDED' });
    expect(studentAttempt.status).toBe(403);

    const suspended = await request(app)
      .patch(`/api/v1/admin/users/${target.id}/status`)
      .set('x-request-id', 'domain-admin-audit-test')
      .set(bearer(adminAccessToken))
      .send({ status: 'SUSPENDED' });
    expect(suspended.status).toBe(200);
    expect(suspended.body.data.user.status).toBe('SUSPENDED');

    const targetLogin = await request(app).post('/api/v1/auth/login').send({
      email: target.email,
      password,
    });
    expect(targetLogin.status).toBe(403);

    const auditLogs = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set(bearer(adminAccessToken));
    expect(auditLogs.status).toBe(200);
    expect(auditLogs.body.data.auditLogs[0]).toMatchObject({
      action: 'USER_STATUS_CHANGED',
      requestId: 'domain-admin-audit-test',
      targetId: target.id,
    });
  });
});
