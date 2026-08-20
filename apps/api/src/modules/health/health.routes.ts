import { Router } from 'express';

export type ReadinessCheck = () => Promise<void>;

export const createHealthRouter = (checkReadiness: ReadinessCheck) => {
  const router = Router();

  const liveResponse = () => ({
    service: 'skillbridge-api',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });

  router.get('/', (_request, response) => {
    response.status(200).json(liveResponse());
  });

  router.get('/live', (_request, response) => {
    response.status(200).json(liveResponse());
  });

  router.get('/ready', async (_request, response) => {
    try {
      await checkReadiness();
      response.status(200).json({ ...liveResponse(), dependencies: { database: 'ready' } });
    } catch {
      response.status(503).json({
        service: 'skillbridge-api',
        status: 'unavailable',
        timestamp: new Date().toISOString(),
        dependencies: { database: 'unavailable' },
      });
    }
  });

  return router;
};
