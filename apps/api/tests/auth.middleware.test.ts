import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { authenticate, requireGlobalRole } from '../src/modules/auth/auth.middleware.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { handleError } from '../src/shared/http/error-handler.js';
import { createRequestId } from '../src/shared/http/request-context.js';

const tokenService = new TokenService({
  accessTokenTtlSeconds: 900,
  audience: 'middleware-tests',
  issuer: 'skillbridge-test-api',
  refreshTokenTtlDays: 30,
  secret: 'middleware-test-secret-with-at-least-32-characters',
});
const app = express();
app.use(pinoHttp({ autoLogging: false, genReqId: createRequestId }));
app.get('/admin', authenticate(tokenService), requireGlobalRole('ADMIN'), (_request, response) => {
  response.status(200).json({ data: { allowed: true } });
});
app.use(handleError);

describe('authentication and global-role middleware', () => {
  it('rejects an anonymous request', async () => {
    const response = await request(app).get('/admin');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('rejects an authenticated user without the required role', async () => {
    const accessToken = await tokenService.createAccessToken({
      email: 'student@example.com',
      globalRole: 'STUDENT',
      id: '00000000-0000-4000-8000-000000000001',
    });
    const response = await request(app).get('/admin').set('authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  it('allows an authenticated user with the required role', async () => {
    const accessToken = await tokenService.createAccessToken({
      email: 'admin@example.com',
      globalRole: 'ADMIN',
      id: '00000000-0000-4000-8000-000000000002',
    });
    const response = await request(app).get('/admin').set('authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { allowed: true } });
  });
});
