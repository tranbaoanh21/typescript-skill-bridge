import { Router } from 'express';

import { authenticate } from '../auth/auth.middleware.js';
import type { TokenService } from '../auth/token.service.js';
import { messageListQuerySchema, realtimeProjectParamsSchema } from './realtime.schemas.js';
import { RealtimeService } from './realtime.service.js';

export const createRealtimeRouter = (service: RealtimeService, tokenService: TokenService) => {
  const router = Router();

  router.get(
    '/projects/:projectId/messages',
    authenticate(tokenService),
    async (request, response) => {
      const { projectId } = realtimeProjectParamsSchema.parse(request.params);
      const query = messageListQuerySchema.parse(request.query);
      const messages = await service.listMessages(projectId, request.auth!.id, {
        ...(query.afterMessageId ? { afterMessageId: query.afterMessageId } : {}),
        limit: query.limit,
      });
      response.status(200).json({ data: { messages } });
    },
  );

  return router;
};
