import type { NextFunction, Request, Response } from 'express';
import type { RedisClientType } from 'redis';
import { describe, expect, it, vi } from 'vitest';

import { createAuthRateLimiter } from '../src/modules/security/rate-limit.js';

const run = async (
  middleware: ReturnType<typeof createAuthRateLimiter>,
  path = '/login',
  method = 'POST',
) => {
  const next = vi.fn();
  const json = vi.fn();
  const status = vi.fn(() => ({ json })) as unknown as Response['status'];
  const setHeader = vi.fn();
  const request = { id: 'request-id', ip: '127.0.0.1', method, path } as Request;
  const response = { json, setHeader, status } as unknown as Response;
  await middleware(request, response, next as NextFunction);
  return { json, next, setHeader, status };
};

describe('authentication rate limiter', () => {
  it('is disabled without Redis and skips non-sensitive auth routes', async () => {
    const disabled = createAuthRateLimiter(undefined, { limit: 2, windowSeconds: 60 });
    expect((await run(disabled)).next).toHaveBeenCalledOnce();

    const redis = { eval: vi.fn() } as unknown as RedisClientType;
    const enabled = createAuthRateLimiter(redis, { limit: 2, windowSeconds: 60 });
    expect((await run(enabled, '/me', 'GET')).next).toHaveBeenCalledOnce();
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('sets standard counters and returns 429 above the atomic Redis limit', async () => {
    const evalMock = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(3);
    const limiter = createAuthRateLimiter({ eval: evalMock } as unknown as RedisClientType, {
      limit: 2,
      windowSeconds: 60,
    });

    const allowed = await run(limiter);
    expect(allowed.next).toHaveBeenCalledOnce();
    expect(allowed.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '1');

    const blocked = await run(limiter);
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(blocked.json).toHaveBeenCalledWith({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please retry later.',
        requestId: 'request-id',
      },
    });
  });

  it('fails open when Redis errors', async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error('down')),
    } as unknown as RedisClientType;
    const limiter = createAuthRateLimiter(redis, { limit: 1, windowSeconds: 60 });
    expect((await run(limiter, '/refresh')).next).toHaveBeenCalledOnce();
  });
});
