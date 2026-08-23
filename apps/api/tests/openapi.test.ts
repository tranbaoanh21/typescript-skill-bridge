import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../src/docs/openapi.js';

describe('OpenAPI contract', () => {
  it('documents every committed API route and bearer authentication', () => {
    const document = createOpenApiDocument();

    expect(Object.keys(document.paths ?? {}).sort()).toEqual([
      '/api/v1/admin/audit-logs',
      '/api/v1/admin/users/{id}/status',
      '/api/v1/applications/me',
      '/api/v1/applications/{applicationId}/decision',
      '/api/v1/applications/{applicationId}/withdraw',
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/auth/me',
      '/api/v1/auth/refresh',
      '/api/v1/auth/register',
      '/api/v1/profile',
      '/api/v1/profile/skills',
      '/api/v1/projects',
      '/api/v1/projects/{id}',
      '/api/v1/projects/{id}/manage',
      '/api/v1/projects/{id}/transitions',
      '/api/v1/projects/{projectId}/applications',
      '/api/v1/projects/{projectId}/members',
      '/api/v1/projects/{projectId}/sprints',
      '/api/v1/projects/{projectId}/tasks',
      '/api/v1/projects/{slug}',
      '/api/v1/skills',
      '/api/v1/tasks/{taskId}',
      '/health',
      '/health/live',
      '/health/ready',
    ]);
    expect(document.components?.securitySchemes).toHaveProperty('bearerAuth');
    expect(document.paths?.['/api/v1/auth/register']?.post?.responses).toHaveProperty('409');
    expect(document.paths?.['/api/v1/auth/me']?.get?.security).toEqual([{ bearerAuth: [] }]);
  });
});
