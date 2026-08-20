import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from '../modules/auth/auth.schemas.js';

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
    ],
  });

export const openApiDocument = createOpenApiDocument();
