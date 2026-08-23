import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { createDocsRouter } from './docs/docs.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import type { AuthServiceContract } from './modules/auth/auth.types.js';
import type { TokenService } from './modules/auth/token.service.js';
import { noOpProjectCache, type ProjectCache } from './modules/cache/project.cache.js';
import { createDomainRouter } from './modules/domain/domain.routes.js';
import type { DomainService } from './modules/domain/domain.service.js';
import { createHealthRouter, type ReadinessCheck } from './modules/health/health.routes.js';
import { createRealtimeRouter } from './modules/realtime/realtime.routes.js';
import type { RealtimeService } from './modules/realtime/realtime.service.js';
import type { RequestHandler } from 'express';
import { handleError } from './shared/http/error-handler.js';
import { createRequestId } from './shared/http/request-context.js';

export interface AppOptions {
  auth?: {
    rateLimiter?: RequestHandler;
    service: AuthServiceContract;
    tokenService: TokenService;
  };
  checkReadiness?: ReadinessCheck;
  projectCache?: ProjectCache;
  corsOrigin: string;
  domain?: {
    service: DomainService;
    tokenService: TokenService;
  };
  enableApiDocs?: boolean;
  enableRequestLogging?: boolean;
  realtime?: {
    service: RealtimeService;
    tokenService: TokenService;
  };
}

export const createApp = ({
  auth,
  checkReadiness = async () => undefined,
  corsOrigin,
  domain,
  enableApiDocs = false,
  enableRequestLogging = true,
  projectCache = noOpProjectCache,
  realtime,
}: AppOptions) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(
    pinoHttp({
      autoLogging: enableRequestLogging,
      genReqId: createRequestId,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.body.password',
          'req.body.refreshToken',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(
    '/health',
    createHealthRouter(checkReadiness, () => projectCache.getMetrics()),
  );

  if (enableApiDocs) {
    app.use('/docs', createDocsRouter());
  }

  if (auth) {
    if (auth.rateLimiter) app.use('/api/v1/auth', auth.rateLimiter);
    app.use('/api/v1/auth', createAuthRouter(auth.service, auth.tokenService));
  }

  if (domain) {
    app.use('/api/v1', createDomainRouter(domain.service, domain.tokenService));
  }

  if (realtime) {
    app.use('/api/v1', createRealtimeRouter(realtime.service, realtime.tokenService));
  }

  app.use((request, response) => {
    response.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'The requested route does not exist.',
        requestId: String(request.id),
      },
    });
  });

  app.use(handleError);

  return app;
};
