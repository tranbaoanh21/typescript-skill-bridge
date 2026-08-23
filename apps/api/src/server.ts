import { createServer } from 'node:http';

import { createDatabaseClient } from '@skillbridge/database';

import { createApp } from './app.js';
import { readEnvironment } from './config/env.js';
import { closeRedisInfrastructure, connectRedisInfrastructure } from './infrastructure/redis.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { TokenService } from './modules/auth/token.service.js';
import { RedisProjectCache, noOpProjectCache } from './modules/cache/project.cache.js';
import { DomainEventBus } from './modules/domain/domain.events.js';
import { DomainService } from './modules/domain/domain.service.js';
import { attachRealtimeServer } from './modules/realtime/realtime.server.js';
import { RealtimeService } from './modules/realtime/realtime.service.js';
import { RedisPresenceStore } from './modules/realtime/presence.store.js';
import { createAuthRateLimiter } from './modules/security/rate-limit.js';

const environment = readEnvironment();
const { database, pool } = createDatabaseClient(environment);
const redis = await connectRedisInfrastructure(environment.REDIS_URL);
const projectCache = redis
  ? new RedisProjectCache(redis.command, {
      detailTtlSeconds: environment.CACHE_PROJECT_DETAIL_TTL_SECONDS,
      listTtlSeconds: environment.CACHE_PROJECT_LIST_TTL_SECONDS,
    })
  : noOpProjectCache;
const tokenService = new TokenService({
  accessTokenTtlSeconds: environment.JWT_ACCESS_TTL_SECONDS,
  audience: environment.AUTH_TOKEN_AUDIENCE,
  issuer: environment.AUTH_TOKEN_ISSUER,
  refreshTokenTtlDays: environment.REFRESH_TOKEN_TTL_DAYS,
  secret: environment.JWT_ACCESS_SECRET,
});
const authService = new AuthService(new AuthRepository(database), tokenService);
const domainEvents = new DomainEventBus();
const realtimeService = new RealtimeService(pool);
const app = createApp({
  auth: {
    rateLimiter: createAuthRateLimiter(redis?.command, {
      limit: environment.AUTH_RATE_LIMIT_MAX,
      windowSeconds: environment.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    }),
    service: authService,
    tokenService,
  },
  checkReadiness: async () => {
    await pool.query('SELECT 1');
  },
  corsOrigin: environment.WEB_ORIGIN,
  domain: { service: new DomainService(pool, domainEvents, projectCache), tokenService },
  enableApiDocs: environment.ENABLE_API_DOCS,
  projectCache,
  realtime: { service: realtimeService, tokenService },
});
const server = createServer(app);
const realtime = attachRealtimeServer({
  corsOrigin: environment.WEB_ORIGIN,
  domainEvents,
  httpServer: server,
  pool,
  ...(redis ? { presenceStore: new RedisPresenceStore(redis.command) } : {}),
  presenceTtlMs: environment.PRESENCE_TTL_SECONDS * 1_000,
  ...(redis ? { redisAdapter: { publisher: redis.publisher, subscriber: redis.subscriber } } : {}),
  tokenService,
});

server.listen(environment.PORT, () => {
  console.info(`SkillBridge API listening on http://localhost:${environment.PORT}`);
});

const shutdown = (signal: NodeJS.Signals) => {
  console.info(`${signal} received. Closing HTTP server.`);

  const forceShutdownTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 10_000);
  forceShutdownTimer.unref();

  realtime.disconnectSockets(true);
  server.close(async (error) => {
    clearTimeout(forceShutdownTimer);
    realtime.close();
    await pool.end();
    await closeRedisInfrastructure(redis);

    if (error) {
      console.error(error);
      process.exitCode = 1;
      return;
    }

    process.exitCode = 0;
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
