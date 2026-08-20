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
      },
    });
  });
});
