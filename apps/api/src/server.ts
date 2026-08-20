import { createServer } from 'node:http';

import { createApp } from './app.js';
import { readEnvironment } from './config/env.js';

const environment = readEnvironment();
const app = createApp({ corsOrigin: environment.WEB_ORIGIN });
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

  server.close((error) => {
    clearTimeout(forceShutdownTimer);

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
