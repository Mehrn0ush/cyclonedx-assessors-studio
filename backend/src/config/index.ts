import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Boolean coercion that works correctly for environment variables.
 *
 * z.coerce.boolean() uses Boolean(value), which returns true for any
 * non-empty string — including "false", "0", and "no". Since env vars
 * are always strings, that makes every _ENABLED=false flag evaluate
 * to true. This helper recognizes the common textual forms.
 */
const envBoolean = (defaultValue: boolean) =>
  z
    .preprocess((v) => {
      if (typeof v === 'boolean') return v;
      if (v === undefined || v === null) return defaultValue;
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === '') return defaultValue;
        if (['true', '1', 'yes', 'on'].includes(s)) return true;
        if (['false', '0', 'no', 'off'].includes(s)) return false;
      }
      return Boolean(v);
    }, z.boolean())
    .default(defaultValue);

const envSchema = z.object({
  DATABASE_PROVIDER: z.enum(['pglite', 'postgres']).default('pglite'),
  DATABASE_URL: z.string().default('postgresql://localhost:5432/assessors_studio'),
  PGLITE_DATA_DIR: z.string().default('./data/pglite'),
  // Optional. If unset, the backend generates a secret on first run
  // and persists it in the app_config table. Set this in environments
  // that run multiple replicas or that need a specific signing key.
  JWT_SECRET: z.string().default(''),
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
  S3_FORCE_PATH_STYLE: envBoolean(false),

  // Application URL (required for external notification channels)
  APP_URL: z.string().default('http://localhost:5173'),

  // Email / SMTP channel
  SMTP_ENABLED: envBoolean(false),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: envBoolean(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default(''),
  SMTP_TLS_REJECT_UNAUTHORIZED: envBoolean(true),

  // Webhook channel
  WEBHOOK_ENABLED: envBoolean(true),
  WEBHOOK_TIMEOUT: z.coerce.number().int().positive().default(10000),
  WEBHOOK_MAX_RETRIES: z.coerce.number().int().positive().default(5),
  WEBHOOK_DELIVERY_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // Chat channels
  SLACK_ENABLED: envBoolean(false),
  TEAMS_ENABLED: envBoolean(false),
  MATTERMOST_ENABLED: envBoolean(false),
  CHAT_TIMEOUT: z.coerce.number().int().positive().default(10000),
  CHAT_DELIVERY_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // Encryption at rest
  MASTER_ENCRYPTION_KEY: z.string().default(''),
  REQUIRE_ENCRYPTION: envBoolean(false),

  // Prometheus metrics
  METRICS_ENABLED: envBoolean(false),
  METRICS_TOKEN: z.string().default(''),
  METRICS_PREFIX: z.string().default('cdxa_'),
  METRICS_DOMAIN_REFRESH_INTERVAL: z.coerce.number().int().positive().default(60),
});

type Env = z.infer<typeof envSchema>;

let config: Env | null = null;

export function getConfig(): Env {
  if (!config) {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      const errors = result.error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      throw new Error(`Invalid environment configuration: ${errors}`);
    }

    config = result.data;
  }

  return config;
}

/**
 * Invalidate the cached config so the next getConfig() call
 * re-reads process.env.  Used by test helpers that override
 * environment variables after the module has been loaded.
 */
export function resetConfig(): void {
  config = null;
}

/**
 * Install the JWT signing secret into the cached config object.
 *
 * The secret is either sourced from the JWT_SECRET environment
 * variable or generated and persisted by bootstrapJwtSecret() on
 * first run. Because modules holding a reference to the cached
 * config share the same object, mutating the property here is
 * visible to every consumer without requiring a reset.
 */
export function setJwtSecret(secret: string): void {
  if (!secret || secret.length < 32) {
    throw new Error('JWT signing secret must be at least 32 characters');
  }
  const cfg = getConfig();
  (cfg as { JWT_SECRET: string }).JWT_SECRET = secret;
}

export default getConfig();
