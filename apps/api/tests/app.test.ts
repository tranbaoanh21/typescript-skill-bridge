import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

describe('SkillBridge API', () => {
  const app = createApp({
    corsOrigin: 'http://localhost:5173',
    enableRequestLogging: false,
  });

  it('reports health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      service: 'skillbridge-api',
      status: 'ok',
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it('returns a consistent not-found error', async () => {
    const response = await request(app).get('/missing');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'The requested route does not exist.',
        requestId: expect.any(String),
      },
    });
  });

  it('exposes liveness and readiness endpoints with request IDs', async () => {
    const liveResponse = await request(app).get('/health/live').set('x-request-id', 'test-request');
    const readyResponse = await request(app).get('/health/ready');

    expect(liveResponse.status).toBe(200);
    expect(liveResponse.header['x-request-id']).toBe('test-request');
    expect(readyResponse.status).toBe(200);
    expect(readyResponse.body.dependencies).toEqual({ database: 'ready' });
  });

  it('exposes cache metrics without requiring Redis', async () => {
    const response = await request(app).get('/health/cache');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      cache: {
        averageLatencyMs: 0,
        enabled: false,
        errors: 0,
        hits: 0,
        misses: 0,
        operations: 0,
      },
      service: 'skillbridge-api',
      status: 'ok',
    });
  });

  it('returns bad request for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('content-type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'MALFORMED_JSON',
      requestId: expect.any(String),
    });
  });

  it('reports unavailable when a readiness dependency fails', async () => {
    const unavailableApp = createApp({
      checkReadiness: async () => {
        throw new Error('Database unavailable');
      },
      corsOrigin: 'http://localhost:5173',
      enableRequestLogging: false,
    });
    const response = await request(unavailableApp).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      dependencies: { database: 'unavailable' },
      status: 'unavailable',
    });
  });

  it('serves Swagger UI and OpenAPI JSON only when documentation is enabled', async () => {
    const documentedApp = createApp({
      corsOrigin: 'http://localhost:5173',
      enableApiDocs: true,
      enableRequestLogging: false,
    });
    const specification = await request(documentedApp).get('/docs/openapi.json');
    const swaggerUi = await request(documentedApp).get('/docs/');
    const disabled = await request(app).get('/docs/openapi.json');

    expect(specification.status).toBe(200);
    expect(specification.body).toMatchObject({
      info: { title: 'HCMUT SkillBridge API' },
      openapi: '3.1.0',
    });
    expect(swaggerUi.status).toBe(200);
    expect(swaggerUi.text).toContain('<title>HCMUT SkillBridge API</title>');
    expect(disabled.status).toBe(404);
  });
});
