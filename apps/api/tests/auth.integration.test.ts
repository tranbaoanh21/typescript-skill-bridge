import { randomUUID } from 'node:crypto';

import { createDatabaseClient } from '@skillbridge/database';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for auth integration tests.');
}

if (new URL(testDatabaseUrl).pathname.slice(1) !== 'skillbridge_test') {
  throw new Error('Refusing to run auth integration tests outside skillbridge_test.');
}

const { database, pool } = createDatabaseClient({
  DATABASE_POOL_MAX: 4,
  DATABASE_URL: testDatabaseUrl,
});
const tokenService = new TokenService({
  accessTokenTtlSeconds: 900,
  audience: 'skillbridge-test-clients',
  issuer: 'skillbridge-test-api',
  refreshTokenTtlDays: 30,
  secret: 'integration-test-secret-with-at-least-32-characters',
});
const authService = new AuthService(new AuthRepository(database), tokenService);
const app = createApp({
  auth: { service: authService, tokenService },
  checkReadiness: async () => {
    await pool.query('SELECT 1');
  },
  corsOrigin: 'http://localhost:5173',
  enableRequestLogging: false,
});
const createdEmails: string[] = [];

const registrationPayload = () => {
  const email = `auth-${randomUUID()}@example.com`;
  createdEmails.push(email);
  return {
    displayName: 'Authentication Test',
    email,
    password: 'correct-horse-battery-staple',
  };
};

beforeAll(async () => {
  await pool.query('SELECT 1 FROM drizzle.__drizzle_migrations LIMIT 1');
});

afterEach(async () => {
  if (createdEmails.length > 0) {
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [createdEmails.splice(0)]);
  }
});

afterAll(async () => {
  await pool.end();
});

describe('authentication API', () => {
  it('registers a user and stores an Argon2id hash', async () => {
    const payload = registrationPayload();
    const response = await request(app).post('/api/v1/auth/register').send(payload);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      tokens: {
        accessToken: expect.any(String),
        expiresIn: 900,
        refreshToken: expect.any(String),
        tokenType: 'Bearer',
      },
      user: {
        email: payload.email,
        globalRole: 'STUDENT',
        id: expect.any(String),
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(payload.password);

    const stored = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE email = $1',
      [payload.email],
    );
    expect(stored.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
  });

  it('normalizes email and rejects duplicate registration', async () => {
    const payload = registrationPayload();
    payload.email = payload.email.toUpperCase();
    const first = await request(app).post('/api/v1/auth/register').send(payload);
    const second = await request(app).post('/api/v1/auth/register').send(payload);

    expect(first.status).toBe(201);
    expect(first.body.data.user.email).toBe(payload.email.toLowerCase());
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      code: 'AUTH_EMAIL_ALREADY_EXISTS',
      requestId: expect.any(String),
    });
  });

  it('logs in with valid credentials and rejects an invalid password', async () => {
    const payload = registrationPayload();
    await request(app).post('/api/v1/auth/register').send(payload);

    const invalid = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: 'incorrect-password' });
    const valid = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password });

    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(valid.status).toBe(200);
    expect(valid.body.data.tokens.accessToken).toEqual(expect.any(String));
  });

  it('prevents suspended accounts from creating or refreshing sessions', async () => {
    const payload = registrationPayload();
    const registration = await request(app).post('/api/v1/auth/register').send(payload);
    const refreshToken = registration.body.data.tokens.refreshToken as string;

    await pool.query("UPDATE users SET status = 'SUSPENDED' WHERE email = $1", [payload.email]);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password });
    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('AUTH_ACCOUNT_SUSPENDED');
    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
  });

  it('authenticates the current user with a signed access token', async () => {
    const payload = registrationPayload();
    const registration = await request(app).post('/api/v1/auth/register').send(payload);
    const accessToken = registration.body.data.tokens.accessToken as string;

    const anonymous = await request(app).get('/api/v1/auth/me');
    const authenticated = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken}`);

    expect(anonymous.status).toBe(401);
    expect(authenticated.status).toBe(200);
    expect(authenticated.body.data.user.email).toBe(payload.email);
  });

  it('rotates refresh tokens and revokes the family on token reuse', async () => {
    const payload = registrationPayload();
    const registration = await request(app).post('/api/v1/auth/register').send(payload);
    const originalToken = registration.body.data.tokens.refreshToken as string;
    const rotation = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalToken });
    const replacementToken = rotation.body.data.tokens.refreshToken as string;

    expect(rotation.status).toBe(200);
    expect(replacementToken).not.toBe(originalToken);

    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalToken });
    const revokedReplacement = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: replacementToken });

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('AUTH_REFRESH_TOKEN_REUSED');
    expect(revokedReplacement.status).toBe(401);
    expect(revokedReplacement.body.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
  });

  it('revokes a refresh token on logout', async () => {
    const payload = registrationPayload();
    const registration = await request(app).post('/api/v1/auth/register').send(payload);
    const refreshToken = registration.body.data.tokens.refreshToken as string;
    const logout = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

    expect(logout.status).toBe(204);
    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
  });

  it('rejects invalid registration input without returning sensitive values', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      displayName: 'A',
      email: 'not-an-email',
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('short');
  });
});
