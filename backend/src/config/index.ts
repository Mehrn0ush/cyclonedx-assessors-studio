import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_PROVIDER: z.enum(['pglite', 'postgres']).default('pglite'),
  DATABASE_URL: z.string().default('postgresql://localhost:5432/assessors_studio'),
  PGLITE_DATA_DIR: z.string().default('./data/pglite'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('24h'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Evidence storage provider
  STORAGE_PROVIDER: z.enum(['database', 's3']).default('database'),
  UPLOAD_MAX_FILE_SIZE: z.coerce.number().int().positive().default(52428800), // 50 MB

  // S3-compatible storage (required when STORAGE_PROVIDER=s3)
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),

  // Application URL (required for external notification channels)
  APP_URL: z.string().default('http://localhost:5173'),

  // Webhook channel (spec 004)
  WEBHOOK_ENABLED: z.coerce.boolean().default(true),
  WEBHOOK_TIMEOUT: z.coerce.number().int().positive().default(10000),
  WEBHOOK_MAX_RETRIES: z.coerce.number().int().positive().default(5),
  WEBHOOK_DELIVERY_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
});

type Env = z.infer<typeof envSchema>;

let config: Env | null = null;

export function getConfig(): Env {
  if (!config) {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      const errors = result.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      throw new Error(`Invalid environment configuration: ${errors}`);
    }

    config = result.data;
  }

  return config;
}

export default getConfig();
