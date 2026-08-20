import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

export interface AppOptions {
  corsOrigin: string;
  enableRequestLogging?: boolean;
}

export const createApp = ({ corsOrigin, enableRequestLogging = true }: AppOptions) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ autoLogging: enableRequestLogging }));

  app.get('/health', (_request, response) => {
    response.status(200).json({
      service: 'skillbridge-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'The requested route does not exist.',
      },
    });
  });

  const handleError: ErrorRequestHandler = (error, request, response, _next) => {
    request.log.error({ error }, 'Unhandled request error');
    response.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
  };

  app.use(handleError);

  return app;
};
