import { Router } from 'express';

import type { CacheMetrics } from '../cache/project.cache.js';

export type ReadinessCheck = () => Promise<void>;

export const createHealthRouter = (
  checkReadiness: ReadinessCheck,
  getCacheMetrics: () => CacheMetrics,
) => {
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

  router.get('/cache', (_request, response) => {
    response
      .status(200)
      .json({ cache: getCacheMetrics(), service: 'skillbridge-api', status: 'ok' });
  });

  return router;
};
