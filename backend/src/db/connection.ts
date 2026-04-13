import { Kysely, PostgresDialect } from 'kysely';
import { KyselyPGlite } from 'kysely-pglite';
import { Pool } from 'pg';
import fs from 'node:fs';
import { getConfig } from '../config/index.js';
import { Database } from './types.js';
import { logger } from '../utils/logger.js';

let db: Kysely<Database> | null = null;

export async function initializeDatabase(): Promise<Kysely<Database>> {
  if (db) {
    return db;
  }

  // Read config at call time (not module load time) so that test helpers
  // can override environment variables before initialisation.
  const config = getConfig();

  try {
    if (config.DATABASE_PROVIDER === 'pglite') {
      logger.info('Initializing PGlite database', {
        dataDir: config.PGLITE_DATA_DIR,
      });

      // Ensure the data directory exists before PGlite tries to use it
      fs.mkdirSync(config.PGLITE_DATA_DIR, { recursive: true });

      const { PGlite } = await import('@electric-sql/pglite');
      const pglite = new PGlite({
        dataDir: config.PGLITE_DATA_DIR,
      });

      const pgliteWrapper = new KyselyPGlite(pglite);

      db = new Kysely<Database>({
        dialect: pgliteWrapper.dialect,
      });
    } else {
      logger.info('Initializing PostgreSQL database', {
        url: config.DATABASE_URL.replace(/\/\/.*@/, '//***@'),
      });

      const pool = new Pool({
        connectionString: config.DATABASE_URL,
      });

      db = new Kysely<Database>({
        dialect: new PostgresDialect({
          pool,
        }),
      });
    }

    logger.info('Database connection established');
    return db;
  } catch (error) {
    logger.error('Failed to initialize database', { error });
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    try {
      await db.destroy();
      db = null;
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection', { error });
      throw error;
    }
  }
}

export function getDatabase(): Kysely<Database> {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}
