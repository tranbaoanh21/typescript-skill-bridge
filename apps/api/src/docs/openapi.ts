import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';

import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from '../modules/auth/auth.schemas.js';
import {
  accountStatusSchema,
  applicationCreateSchema,
  applicationDecisionSchema,
  profileUpdateSchema,
  projectCreateSchema,
  projectListQuerySchema,
  projectTransitionSchema,
  projectUpdateSchema,
  sprintCreateSchema,
  taskCreateSchema,
  taskUpdateSchema,
  userSkillsUpdateSchema,
} from '../modules/domain/domain.schemas.js';
import { z } from '../shared/validation/zod.js';

const registry = new OpenAPIRegistry();

const globalRoleSchema = z.enum(['STUDENT', 'MENTOR', 'ADMIN']);
const publicUserSchema = registry.register(
  'PublicUser',
  z.object({
    email: z.email().meta({ example: 'student@hcmut.edu.vn' }),
    globalRole: globalRoleSchema.meta({ example: 'STUDENT' }),
    id: z.uuid().meta({ example: 'd3d9676f-7a0a-4e99-9c41-7a7ec33cfe39' }),
  }),
);
const tokenPairSchema = registry.register(
  'TokenPair',
  z.object({
    accessToken: z.string().meta({ example: 'eyJhbGciOiJIUzI1NiJ9...' }),
    expiresIn: z.int().positive().meta({ example: 900 }),
    refreshToken: z.string().meta({ example: 'opaque-refresh-token-value' }),
    tokenType: z.literal('Bearer'),
  }),
);
const authResultSchema = registry.register(
  'AuthResult',
  z.object({ tokens: tokenPairSchema, user: publicUserSchema }),
);
const authEnvelopeSchema = registry.register('AuthEnvelope', z.object({ data: authResultSchema }));
const currentUserEnvelopeSchema = registry.register(
  'CurrentUserEnvelope',
  z.object({ data: z.object({ user: publicUserSchema }) }),
);
const errorEnvelopeSchema = registry.register(
  'ErrorEnvelope',
  z.object({
    error: z.object({
      code: z.string().meta({ example: 'AUTH_INVALID_CREDENTIALS' }),
      details: z.unknown().optional(),
      message: z.string().meta({ example: 'The email or password is incorrect.' }),
      requestId: z.string().meta({ example: '7d3e11c2-d39a-4456-8d77-07145bb42fa8' }),
    }),
  }),
);
const liveHealthSchema = registry.register(
  'LiveHealth',
  z.object({
    service: z.literal('skillbridge-api'),
    status: z.literal('ok'),
    timestamp: z.iso.datetime().meta({ example: '2026-08-20T12:00:00.000Z' }),
  }),
);
const readyHealthSchema = registry.register(
  'ReadyHealth',
  liveHealthSchema.extend({ dependencies: z.object({ database: z.literal('ready') }) }),
);
const unavailableHealthSchema = registry.register(
  'UnavailableHealth',
  z.object({
    dependencies: z.object({ database: z.literal('unavailable') }),
    service: z.literal('skillbridge-api'),
    status: z.literal('unavailable'),
    timestamp: z.iso.datetime(),
  }),
);
const domainSuccessSchema = registry.register(
  'DomainSuccessEnvelope',
  z.object({ data: z.record(z.string(), z.unknown()) }),
);

const registerRequestSchema = registry.register('RegisterRequest', registerSchema);
const loginRequestSchema = registry.register('LoginRequest', loginSchema);
const refreshRequestSchema = registry.register('RefreshRequest', refreshSchema);
const logoutRequestSchema = registry.register('LogoutRequest', logoutSchema);

registry.registerComponent('securitySchemes', 'bearerAuth', {
  bearerFormat: 'JWT',
  scheme: 'bearer',
  type: 'http',
});

const errorResponse = (description: string, code: string, message: string) => ({
  content: {
    'application/json': {
      example: {
        error: {
          code,
          message,
          requestId: '7d3e11c2-d39a-4456-8d77-07145bb42fa8',
        },
      },
      schema: errorEnvelopeSchema,
    },
  },
  description,
});

for (const path of ['/health', '/health/live'] as const) {
  registry.registerPath({
    method: 'get',
    path,
    responses: {
      200: {
        content: { 'application/json': { schema: liveHealthSchema } },
        description: 'The API process is alive.',
      },
    },
    summary: path === '/health' ? 'Legacy health check' : 'Liveness check',
    tags: ['Health'],
  });
}

registry.registerPath({
  method: 'get',
  path: '/health/ready',
  responses: {
    200: {
      content: { 'application/json': { schema: readyHealthSchema } },
      description: 'The API and PostgreSQL are ready to receive traffic.',
    },
    503: {
      content: { 'application/json': { schema: unavailableHealthSchema } },
      description: 'PostgreSQL is unavailable.',
    },
  },
  summary: 'Readiness check',
  tags: ['Health'],
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/register',
  request: {
    body: {
      content: {
        'application/json': {
          example: {
            displayName: 'Bao Anh',
            email: 'baoanh@hcmut.edu.vn',
            password: 'correct-horse-battery-staple',
          },
          schema: registerRequestSchema,
        },
      },
      description: 'New account credentials and display name.',
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: authEnvelopeSchema } },
      description: 'Account and initial session created.',
    },
    400: errorResponse(
      'Payload validation failed.',
      'VALIDATION_ERROR',
      'The request payload is invalid.',
    ),
    409: errorResponse(
      'The normalized email already exists.',
      'AUTH_EMAIL_ALREADY_EXISTS',
      'An account with this email already exists.',
    ),
  },
  summary: 'Register an account',
  tags: ['Authentication'],
});

const projectIdParams = z.object({
  projectId: z.uuid().openapi({ param: { in: 'path', name: 'projectId' } }),
});
const idParams = z.object({ id: z.uuid().openapi({ param: { in: 'path', name: 'id' } }) });
const applicationIdParams = z.object({
  applicationId: z.uuid().openapi({ param: { in: 'path', name: 'applicationId' } }),
});
const taskIdParams = z.object({
  taskId: z.uuid().openapi({ param: { in: 'path', name: 'taskId' } }),
});
const slugParams = z.object({
  slug: z.string().openapi({ param: { in: 'path', name: 'slug' }, example: 'hcmut-skillbridge' }),
});

interface DomainPathOptions {
  authenticated?: boolean;
  body?: z.ZodType;
  bodyExample?: unknown;
  method: 'get' | 'post' | 'put' | 'patch';
  params?: z.ZodObject;
  path: string;
  query?: z.ZodObject;
  status?: number;
  summary: string;
  tag: 'Profiles' | 'Projects' | 'Applications' | 'Workspace' | 'Administration';
}

const registerDomainPath = ({
  authenticated = true,
  body,
  bodyExample,
  method,
  params,
  path,
  query,
  status = method === 'post' ? 201 : 200,
  summary,
  tag,
}: DomainPathOptions) => {
  const request = {
    ...(body
      ? {
          body: {
            content: { 'application/json': { example: bodyExample, schema: body } },
          },
        }
      : {}),
    ...(params ? { params } : {}),
    ...(query ? { query } : {}),
  };

  registry.registerPath({
    method,
    path,
    ...(Object.keys(request).length > 0 ? { request } : {}),
    responses: {
      [status]: {
        content: {
          'application/json': {
            example: { data: { result: 'See the named resource schema in the response.' } },
            schema: domainSuccessSchema,
          },
        },
        description: 'The operation completed successfully.',
      },
      400: errorResponse(
        'Payload validation failed.',
        'VALIDATION_ERROR',
        'The request payload is invalid.',
      ),
      ...(authenticated
        ? {
            401: errorResponse(
              'Authentication is missing or invalid.',
              'AUTH_UNAUTHORIZED',
              'Authentication is required.',
            ),
            403: errorResponse(
              'The caller lacks the required permission.',
              'AUTH_FORBIDDEN',
              'You do not have permission.',
            ),
          }
        : {}),
      404: errorResponse(
        'The requested resource was not found.',
        'RESOURCE_NOT_FOUND',
        'The resource does not exist.',
      ),
      409: errorResponse(
        'A domain invariant or version check failed.',
        'VERSION_CONFLICT',
        'The resource was changed by another request.',
      ),
    },
    ...(authenticated ? { security: [{ bearerAuth: [] }] } : {}),
    summary,
    tags: [tag],
  });
};

registerDomainPath({
  authenticated: false,
  method: 'get',
  path: '/api/v1/skills',
  summary: 'List the skill catalog',
  tag: 'Profiles',
});
registerDomainPath({
  method: 'get',
  path: '/api/v1/profile',
  summary: 'Get the current profile',
  tag: 'Profiles',
});
registerDomainPath({
  body: profileUpdateSchema,
  bodyExample: {
    bio: 'Second-year HCMUT student learning full-stack TypeScript.',
    major: 'Computer Science',
  },
  method: 'put',
  path: '/api/v1/profile',
  summary: 'Update the current profile',
  tag: 'Profiles',
});
registerDomainPath({
  body: userSkillsUpdateSchema,
  bodyExample: { skills: [{ level: 4, skillId: '00000000-0000-4000-8000-000000000102' }] },
  method: 'put',
  path: '/api/v1/profile/skills',
  summary: 'Replace current-user skills',
  tag: 'Profiles',
});
registerDomainPath({
  authenticated: false,
  method: 'get',
  path: '/api/v1/projects',
  query: projectListQuerySchema,
  summary: 'Discover public projects',
  tag: 'Projects',
});
registerDomainPath({
  authenticated: false,
  method: 'get',
  params: slugParams,
  path: '/api/v1/projects/{slug}',
  summary: 'Get a public project',
  tag: 'Projects',
});
registerDomainPath({
  method: 'get',
  params: idParams,
  path: '/api/v1/projects/{id}/manage',
  summary: 'Get an owned project in any lifecycle state',
  tag: 'Projects',
});
registerDomainPath({
  body: projectCreateSchema,
  bodyExample: {
    capacity: 5,
    description: 'Build a collaboration platform for HCMUT student projects.',
    requiredSkills: [],
    slug: 'hcmut-skillbridge',
    title: 'HCMUT SkillBridge',
  },
  method: 'post',
  path: '/api/v1/projects',
  summary: 'Create a draft project',
  tag: 'Projects',
});
registerDomainPath({
  body: projectUpdateSchema,
  bodyExample: { capacity: 6, title: 'HCMUT SkillBridge MVP', version: 1 },
  method: 'patch',
  params: idParams,
  path: '/api/v1/projects/{id}',
  summary: 'Update a project with optimistic concurrency',
  tag: 'Projects',
});
registerDomainPath({
  body: projectTransitionSchema,
  bodyExample: { action: 'PUBLISH', version: 1 },
  method: 'post',
  params: idParams,
  path: '/api/v1/projects/{id}/transitions',
  status: 200,
  summary: 'Transition project lifecycle state',
  tag: 'Projects',
});
registerDomainPath({
  method: 'get',
  params: projectIdParams,
  path: '/api/v1/projects/{projectId}/members',
  summary: 'List project members',
  tag: 'Projects',
});
registerDomainPath({
  body: applicationCreateSchema,
  bodyExample: { coverLetter: 'I can contribute TypeScript and PostgreSQL experience.' },
  method: 'post',
  params: projectIdParams,
  path: '/api/v1/projects/{projectId}/applications',
  summary: 'Apply to a recruiting project',
  tag: 'Applications',
});
registerDomainPath({
  method: 'get',
  path: '/api/v1/applications/me',
  summary: 'List current-user applications',
  tag: 'Applications',
});
registerDomainPath({
  method: 'post',
  params: applicationIdParams,
  path: '/api/v1/applications/{applicationId}/withdraw',
  status: 200,
  summary: 'Withdraw a pending application',
  tag: 'Applications',
});
registerDomainPath({
  method: 'get',
  params: projectIdParams,
  path: '/api/v1/projects/{projectId}/applications',
  summary: 'List applications for a managed project',
  tag: 'Applications',
});
registerDomainPath({
  body: applicationDecisionSchema,
  bodyExample: { decision: 'ACCEPTED', note: 'Strong fit for the project.' },
  method: 'post',
  params: applicationIdParams,
  path: '/api/v1/applications/{applicationId}/decision',
  status: 200,
  summary: 'Accept or reject a pending application atomically',
  tag: 'Applications',
});
registerDomainPath({
  body: sprintCreateSchema,
  bodyExample: { endsOn: '2026-09-07', name: 'Sprint 1', startsOn: '2026-09-01' },
  method: 'post',
  params: projectIdParams,
  path: '/api/v1/projects/{projectId}/sprints',
  summary: 'Create a sprint',
  tag: 'Workspace',
});
registerDomainPath({
  method: 'get',
  params: projectIdParams,
  path: '/api/v1/projects/{projectId}/sprints',
  summary: 'List project sprints',
  tag: 'Workspace',
});
registerDomainPath({
  body: taskCreateSchema,
  bodyExample: { assigneeIds: [], priority: 'HIGH', title: 'Build project discovery page' },
  method: 'post',
  params: projectIdParams,
  path: '/api/v1/projects/{projectId}/tasks',
  summary: 'Create a project task',
  tag: 'Workspace',
});
registerDomainPath({
  method: 'get',
  params: projectIdParams,
  path: '/api/v1/projects/{projectId}/tasks',
  summary: 'List project tasks',
  tag: 'Workspace',
});
registerDomainPath({
  body: taskUpdateSchema,
  bodyExample: { status: 'IN_PROGRESS', version: 1 },
  method: 'patch',
  params: taskIdParams,
  path: '/api/v1/tasks/{taskId}',
  summary: 'Update a task with optimistic concurrency',
  tag: 'Workspace',
});
registerDomainPath({
  body: accountStatusSchema,
  bodyExample: { status: 'SUSPENDED' },
  method: 'patch',
  params: idParams,
  path: '/api/v1/admin/users/{id}/status',
  summary: 'Suspend or restore a user',
  tag: 'Administration',
});
registerDomainPath({
  method: 'get',
  path: '/api/v1/admin/audit-logs',
  summary: 'List immutable audit events',
  tag: 'Administration',
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  request: {
    body: {
      content: {
        'application/json': {
          example: { email: 'baoanh@hcmut.edu.vn', password: 'correct-horse-battery-staple' },
          schema: loginRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: authEnvelopeSchema } },
      description: 'Credentials verified and a new session created.',
    },
    400: errorResponse(
      'Payload validation failed.',
      'VALIDATION_ERROR',
      'The request payload is invalid.',
    ),
    401: errorResponse(
      'Credentials are invalid.',
      'AUTH_INVALID_CREDENTIALS',
      'The email or password is incorrect.',
    ),
    403: errorResponse(
      'The account is suspended.',
      'AUTH_ACCOUNT_SUSPENDED',
      'This account is suspended.',
    ),
  },
  summary: 'Log in',
  tags: ['Authentication'],
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/refresh',
  request: {
    body: {
      content: {
        'application/json': {
          example: { refreshToken: 'opaque-refresh-token-value-from-login' },
          schema: refreshRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: authEnvelopeSchema } },
      description: 'Refresh token rotated and a new token pair issued.',
    },
    400: errorResponse(
      'Payload validation failed.',
      'VALIDATION_ERROR',
      'The request payload is invalid.',
    ),
    401: errorResponse(
      'The refresh token is invalid, expired, revoked, or reused.',
      'AUTH_REFRESH_TOKEN_INVALID',
      'The refresh token is invalid or expired.',
    ),
  },
  summary: 'Rotate a refresh token',
  tags: ['Authentication'],
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  request: {
    body: {
      content: {
        'application/json': {
          example: { refreshToken: 'opaque-refresh-token-value-from-login' },
          schema: logoutRequestSchema,
        },
      },
    },
  },
  responses: {
    204: { description: 'The refresh session is revoked idempotently.' },
    400: errorResponse(
      'Payload validation failed.',
      'VALIDATION_ERROR',
      'The request payload is invalid.',
    ),
  },
  summary: 'Log out',
  tags: ['Authentication'],
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/me',
  responses: {
    200: {
      content: { 'application/json': { schema: currentUserEnvelopeSchema } },
      description: 'Claims from the verified access token.',
    },
    401: errorResponse(
      'The Bearer token is missing, invalid, or expired.',
      'AUTH_ACCESS_TOKEN_INVALID',
      'The access token is invalid or expired.',
    ),
  },
  security: [{ bearerAuth: [] }],
  summary: 'Get the current authenticated user',
  tags: ['Authentication'],
});

export const createOpenApiDocument = () =>
  new OpenApiGeneratorV31(registry.definitions, {
    sortComponents: 'alphabetically',
  }).generateDocument({
    info: {
      description: 'HTTP contract for HCMUT SkillBridge web, mobile, and API-testing clients.',
      title: 'HCMUT SkillBridge API',
      version: '0.1.0',
    },
    openapi: '3.1.0',
    servers: [
      { description: 'Local development', url: 'http://localhost:3000' },
      { description: 'Current origin', url: '/' },
    ],
    tags: [
      { description: 'Process and dependency health probes.', name: 'Health' },
      { description: 'Account sessions and access tokens.', name: 'Authentication' },
      { description: 'Current-user profile and skill catalog.', name: 'Profiles' },
      { description: 'Project discovery, ownership, and lifecycle.', name: 'Projects' },
      { description: 'Application submission and decisions.', name: 'Applications' },
      { description: 'Member-only sprints and task board.', name: 'Workspace' },
      { description: 'Global moderation and audit events.', name: 'Administration' },
    ],
  });

export const openApiDocument = createOpenApiDocument();
