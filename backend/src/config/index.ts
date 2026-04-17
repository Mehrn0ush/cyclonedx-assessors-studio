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

  // Self service registration gate.
  //   disabled    — reject every POST /register request (default).
  //   invite_only — require a valid unused invite token issued by an admin.
  //   open        — accept any well formed registration (legacy behavior).
  // Defaults to disabled so a fresh deployment is closed until the operator
  // makes an explicit choice.
  REGISTRATION_MODE: z.enum(['disabled', 'invite_only', 'open']).default('disabled'),

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

  // Authentication throttling and account lockout.
  // LOGIN_MAX_FAILED_ATTEMPTS: number of consecutive failed password
  // verifications that trigger a temporary account lock. Set to 0 to
  // disable lockout (counter is still tracked for auditing).
  // LOGIN_LOCKOUT_DURATION_MINUTES: backoff window applied after the
  // threshold is reached. A successful login before the window expires
  // is still rejected; operators unlock early by clearing locked_until.
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().nonnegative().default(5),
  LOGIN_LOCKOUT_DURATION_MINUTES: z.coerce.number().int().positive().default(15),

  // Session and invite cleanup.
  // SESSION_CLEANUP_INTERVAL_MINUTES: how often the background job sweeps
  // expired sessions and stale invites. Set to 0 to disable the job (not
  // recommended outside tests).
  // SESSION_RETAIN_EXPIRED_HOURS: how long expired sessions are kept
  // before they are deleted. A small retention window is useful for
  // forensic auditing when a token was replayed after expiration.
  // INVITE_RETAIN_AFTER_TERMINAL_DAYS: how long consumed or revoked
  // invites stay in the table before they are deleted.
  SESSION_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().nonnegative().default(15),
  SESSION_RETAIN_EXPIRED_HOURS: z.coerce.number().int().nonnegative().default(24),
  INVITE_RETAIN_AFTER_TERMINAL_DAYS: z.coerce.number().int().nonnegative().default(30),

  // Cookie security hardening.
  // COOKIE_SECURE:
  //   - "auto" (default): infer the Secure flag from APP_URL scheme and
  //     NODE_ENV. Any https:// APP_URL or production NODE_ENV marks
  //     cookies Secure.
  //   - "true" / "false": force the flag on or off regardless of other
  //     signals. Use "true" when the app is deployed behind a TLS
  //     terminator that does not advertise https to the Node process.
  COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  // TRUST_PROXY_HOPS: number of reverse proxy hops to trust for
  // X-Forwarded-* header parsing. 0 keeps Express's default (disabled).
  // Setting this to 1 is appropriate when a single TLS-terminating
  // ingress (e.g. nginx, ALB, Traefik) sits directly in front of the
  // Node process.
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),

  // Password policy.
  // PASSWORD_MIN_LENGTH: minimum character length for newly created
  // passwords (registration, setup, admin create, password change).
  // Login path intentionally allows shorter passwords so legacy
  // accounts predating a tightened policy can still authenticate.
  // Default of 12 aligns with OWASP ASVS 5.0 L1 (requirement 2.1.1).
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).max(128).default(12),
  // PASSWORD_HIBP_CHECK_ENABLED: when true, new passwords are checked
  // against the Have I Been Pwned range API using k-anonymity. Only
  // the first five hex characters of the SHA-1 hash ever leave the
  // server. Defaults to false so that standalone or air-gapped
  // deployments and test suites do not make outbound calls.
  PASSWORD_HIBP_CHECK_ENABLED: envBoolean(false),
  // PASSWORD_HIBP_TIMEOUT_MS: hard cap on the HIBP request. The check
  // fails open on timeout or network error so an unreachable service
  // cannot lock users out of password rotation.
  PASSWORD_HIBP_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
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
 * Startup-time configuration guards.
 *
 * These checks refuse to boot the process when a combination of
 * settings would leave the service in an unsafe or clearly
 * misconfigured state. They are intentionally noisy: the operator
 * should see a specific error and know exactly which environment
 * variable to change.
 *
 * Called from the entrypoint after getConfig() returns. Safe to call
 * from tests that want to assert the guard logic directly; callers
 * that only want the cached config should use getConfig().
 */
export function validateStartupConfig(cfg: Env = getConfig()): void {
  // Metrics endpoint is only safe to expose when a bearer token is
  // configured. Without it the endpoint serves internal counters
  // unauthenticated and can leak operational signal to anyone that
  // reaches the container port.
  if (cfg.METRICS_ENABLED && cfg.NODE_ENV !== 'test') {
    if (!cfg.METRICS_TOKEN || cfg.METRICS_TOKEN.length < 16) {
      throw new Error(
        'METRICS_ENABLED=true but METRICS_TOKEN is unset or shorter than 16 characters. ' +
          'Set METRICS_TOKEN to a long random string so the /metrics endpoint is not ' +
          'served unauthenticated, or set METRICS_ENABLED=false to disable the endpoint.',
      );
    }
  }
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
