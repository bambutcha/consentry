import { loadEnv } from './config/env.js';
import { createLogger } from './infrastructure/logging/logger.js';
import { createDb } from './infrastructure/db/kysely.js';
import { createPreferencesRepository } from './infrastructure/db/preferencesRepository.js';
import { createPoliciesRepository } from './infrastructure/db/policiesRepository.js';
import { createPreferencesService } from './application/preferencesService.js';
import { buildServer } from './infrastructure/http/server.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const db = createDb(env.DATABASE_URL);

  const service = createPreferencesService({
    preferences: createPreferencesRepository(db),
    policies: createPoliciesRepository(db),
    logger,
  });

  const app = buildServer({ service, logger });

  await app.listen({ port: env.HTTP_PORT, host: env.HTTP_HOST });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await db.destroy();
      process.exit(0);
    } catch (e) {
      logger.error({ err: e }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
