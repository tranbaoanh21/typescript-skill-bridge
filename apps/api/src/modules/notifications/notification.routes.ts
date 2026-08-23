import { Router } from 'express';

import { z } from '../../shared/validation/zod.js';
import { authenticate } from '../auth/auth.middleware.js';
import type { TokenService } from '../auth/token.service.js';
import { NotificationService } from './notification.service.js';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const notificationIdSchema = z.object({ id: z.uuid() });

export const createNotificationRouter = (
  service: NotificationService,
  tokenService: TokenService,
) => {
  const router = Router();
  const requireAuthentication = authenticate(tokenService);

  router.get('/notifications', requireAuthentication, async (request, response) => {
    const { limit } = listQuerySchema.parse(request.query);
    const notifications = await service.list(request.auth!.id, limit);
    response.status(200).json({ data: { notifications } });
  });

  router.post('/notifications/:id/read', requireAuthentication, async (request, response) => {
    const { id } = notificationIdSchema.parse(request.params);
    const notification = await service.markRead(id, request.auth!.id);
    response.status(200).json({ data: { notification } });
  });

  return router;
};
