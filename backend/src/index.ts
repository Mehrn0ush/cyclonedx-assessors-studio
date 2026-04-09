import { createApp } from './app.js';
import { getConfig } from './config/index.js';
import { initializeDatabase, closeDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { seedDefaultRolesAndPermissions } from './db/seed.js';
import { initializeStorage } from './storage/index.js';
import { initializeEventSystem, shutdownEventSystem } from './events/index.js';
import { startDomainGaugeRefresh, stopDomainGaugeRefresh } from './metrics/index.js';
import { startHealthChecks, stopHealthChecks } from './routes/health.js';
import { logger } from './utils/logger.js';

const config = getConfig();
const app = createApp();

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  try {
    stopDomainGaugeRefresh();
    stopHealthChecks();
    await shutdownEventSystem();
    logger.info('Event system shut down');
    await closeDatabase();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error during shutdown', { error });
  }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function start() {
  try {
    logger.info('Initializing database...');
    await initializeDatabase();
    await runMigrations();
    await seedDefaultRolesAndPermissions();
    logger.info('Database initialized');

    logger.info('Initializing storage...');
    initializeStorage();
    logger.info('Storage initialized');

    logger.info('Initializing event system...');
    await initializeEventSystem();
    logger.info('Event system initialized');

    // Start periodic background tasks
    if (config.METRICS_ENABLED) {
      startDomainGaugeRefresh();
      logger.info('Prometheus domain gauge refresh started');
    }
    startHealthChecks();

    const port = config.PORT;
    app.listen(port, () => {
      logger.info(`Server started on port ${port}`, {
        environment: config.NODE_ENV,
        databaseProvider: config.DATABASE_PROVIDER,
        metricsEnabled: config.METRICS_ENABLED,
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

start();

export default app;
