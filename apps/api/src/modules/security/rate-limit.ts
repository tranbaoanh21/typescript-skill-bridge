import { createHash } from 'node:crypto';

import type { RequestHandler } from 'express';
import type { RedisClientType } from 'redis';

interface RateLimiterOptions {
  limit: number;
  windowSeconds: number;
}

const incrementWithExpiry = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export const createAuthRateLimiter = (
  redis: RedisClientType | undefined,
  { limit, windowSeconds }: RateLimiterOptions,
): RequestHandler => {
  if (!redis) return (_request, _response, next) => next();

  return async (request, response, next) => {
    if (request.method !== 'POST' || !['/login', '/refresh', '/register'].includes(request.path)) {
      next();
      return;
    }
    const identity = `${request.ip ?? 'unknown'}:${request.method}:${request.path}`;
    const digest = createHash('sha256').update(identity).digest('hex');
    const key = `skillbridge:v1:rate-limit:auth:${digest}`;

    try {
      const count = Number(
        await redis.eval(incrementWithExpiry, { arguments: [String(windowSeconds)], keys: [key] }),
      );
      response.setHeader('RateLimit-Limit', String(limit));
      response.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)));
      response.setHeader('RateLimit-Reset', String(windowSeconds));
      if (count > limit) {
        response.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many authentication attempts. Please retry later.',
            requestId: String(request.id),
          },
        });
        return;
      }
      next();
    } catch (error) {
      console.warn('Redis rate limiter failed; allowing the request.', error);
      next();
    }
  };
};
