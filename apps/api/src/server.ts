import { createServer } from 'node:http';

import { createDatabaseClient } from '@skillbridge/database';

import { createApp } from './app.js';
import { readEnvironment } from './config/env.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { TokenService } from './modules/auth/token.service.js';
import { DomainService } from './modules/domain/domain.service.js';

const environment = readEnvironment();
const { database, pool } = createDatabaseClient(environment);
const tokenService = new TokenService({
  accessTokenTtlSeconds: environment.JWT_ACCESS_TTL_SECONDS,
  audience: environment.AUTH_TOKEN_AUDIENCE,
  issuer: environment.AUTH_TOKEN_ISSUER,
  refreshTokenTtlDays: environment.REFRESH_TOKEN_TTL_DAYS,
  secret: environment.JWT_ACCESS_SECRET,
});
const authService = new AuthService(new AuthRepository(database), tokenService);
const app = createApp({
  auth: { service: authService, tokenService },
  checkReadiness: async () => {
    await pool.query('SELECT 1');
  },
  corsOrigin: environment.WEB_ORIGIN,
  domain: { service: new DomainService(pool), tokenService },
  enableApiDocs: environment.ENABLE_API_DOCS,
});
const server = createServer(app);

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

  server.close(async (error) => {
    clearTimeout(forceShutdownTimer);
    await pool.end();

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
