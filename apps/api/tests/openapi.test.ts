import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../src/docs/openapi.js';

describe('OpenAPI contract', () => {
  it('documents every Phase 4 route and bearer authentication', () => {
    const document = createOpenApiDocument();

    expect(Object.keys(document.paths ?? {}).sort()).toEqual([
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/auth/me',
      '/api/v1/auth/refresh',
      '/api/v1/auth/register',
      '/health',
      '/health/live',
      '/health/ready',
    ]);
    expect(document.components?.securitySchemes).toHaveProperty('bearerAuth');
    expect(document.paths?.['/api/v1/auth/register']?.post?.responses).toHaveProperty('409');
    expect(document.paths?.['/api/v1/auth/me']?.get?.security).toEqual([{ bearerAuth: [] }]);
  });
});
