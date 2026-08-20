import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { createDocsRouter } from './docs/docs.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import type { AuthServiceContract } from './modules/auth/auth.types.js';
import type { TokenService } from './modules/auth/token.service.js';
import { createHealthRouter, type ReadinessCheck } from './modules/health/health.routes.js';
import { handleError } from './shared/http/error-handler.js';
import { createRequestId } from './shared/http/request-context.js';

export interface AppOptions {
  auth?: {
    service: AuthServiceContract;
    tokenService: TokenService;
  };
  checkReadiness?: ReadinessCheck;
  corsOrigin: string;
  enableApiDocs?: boolean;
  enableRequestLogging?: boolean;
}

export const createApp = ({
  auth,
  checkReadiness = async () => undefined,
  corsOrigin,
  enableApiDocs = false,
  enableRequestLogging = true,
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

  app.use('/health', createHealthRouter(checkReadiness));

  if (enableApiDocs) {
    app.use('/docs', createDocsRouter());
  }

  if (auth) {
    app.use('/api/v1/auth', createAuthRouter(auth.service, auth.tokenService));
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
