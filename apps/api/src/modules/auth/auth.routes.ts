import { Router, type Request } from 'express';

import { unauthorized } from '../../shared/http/api-error.js';
import { authenticate } from './auth.middleware.js';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from './auth.schemas.js';
import type { AuthServiceContract, SessionMetadata } from './auth.types.js';
import type { TokenService } from './token.service.js';

const sessionMetadata = (request: Request): SessionMetadata => {
  const userAgent = request.header('user-agent');
  const ipAddress = request.ip?.slice(0, 45);

  return {
    ...(ipAddress === undefined ? {} : { ipAddress }),
    ...(userAgent === undefined ? {} : { userAgent }),
  };
};

export const createAuthRouter = (authService: AuthServiceContract, tokenService: TokenService) => {
  const router = Router();

  router.post('/register', async (request, response) => {
    const result = await authService.register(
      registerSchema.parse(request.body),
      sessionMetadata(request),
    );
    response.status(201).json({ data: result });
  });

  router.post('/login', async (request, response) => {
    const result = await authService.login(
      loginSchema.parse(request.body),
      sessionMetadata(request),
    );
    response.status(200).json({ data: result });
  });

  router.post('/refresh', async (request, response) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    const result = await authService.refresh(refreshToken, sessionMetadata(request));
    response.status(200).json({ data: result });
  });

  router.post('/logout', async (request, response) => {
    const { refreshToken } = logoutSchema.parse(request.body);
    await authService.logout(refreshToken);
    response.status(204).send();
  });

  router.get('/me', authenticate(tokenService), (request, response) => {
    if (!request.auth) {
      throw unauthorized();
    }
    response.status(200).json({ data: { user: request.auth } });
  });

  return router;
};
