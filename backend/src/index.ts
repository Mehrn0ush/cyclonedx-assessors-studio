import { createApp } from './app.js';
import { getConfig } from './config/index.js';
import { initializeDatabase, closeDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { seedDefaultRolesAndPermissions } from './db/seed.js';
import { logger } from './utils/logger.js';

const config = getConfig();
const app = createApp();

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  try {
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

    const port = config.PORT;
    app.listen(port, () => {
      logger.info(`Server started on port ${port}`, {
        environment: config.NODE_ENV,
        databaseProvider: config.DATABASE_PROVIDER,
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

start();

export default app;
