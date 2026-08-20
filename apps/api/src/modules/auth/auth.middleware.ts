import type { RequestHandler } from 'express';

import { forbidden, unauthorized } from '../../shared/http/api-error.js';
import type { GlobalRole } from './auth.types.js';
import type { TokenService } from './token.service.js';

export const authenticate =
  (tokenService: TokenService): RequestHandler =>
  async (request, _response, next) => {
    try {
      const authorization = request.header('authorization');

      if (!authorization?.startsWith('Bearer ')) {
        throw unauthorized();
      }

      const accessToken = authorization.slice('Bearer '.length).trim();

      if (!accessToken) {
        throw unauthorized();
      }

      request.auth = await tokenService.verifyAccessToken(accessToken);
      next();
    } catch (error) {
      next(error);
    }
  };

export const requireGlobalRole =
  (...allowedRoles: GlobalRole[]): RequestHandler =>
  (request, _response, next) => {
    if (!request.auth) {
      next(unauthorized());
      return;
    }

    if (!allowedRoles.includes(request.auth.globalRole)) {
      next(forbidden());
      return;
    }

    next();
  };
