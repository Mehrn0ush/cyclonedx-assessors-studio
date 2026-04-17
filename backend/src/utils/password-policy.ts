import crypto from 'node:crypto';
import { getConfig } from '../config/index.js';
import { logger } from './logger.js';

/**
 * Upper bound applied regardless of configuration. argon2id hashes
 * scale with input length and sufficiently long passwords can be
 * abused for resource exhaustion at the /register or /change-password
 * endpoints. The bound also matches OWASP ASVS 5.0 guidance that
 * applications should accept passwords up to 128 characters.
 */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Small deny list of obvious weak values. The HIBP check subsumes
 * most of these when enabled, but the list guarantees a sensible
 * rejection even in offline deployments. Comparisons are
 * case-insensitive.
 */
const BANNED_PASSWORDS: ReadonlySet<string> = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  'passwordpassword',
  'administrator',
  'administrator1',
  'letmeinplease',
  'letmein12345',
  'qwertyuiopas',
  'qwerty123456',
  '123456789012',
  'iloveyou1234',
  'welcomeplease',
  'changemeplease',
  'changeme1234',
  'cyclonedx1234',
  'assessorsstudio',
]);

export interface PasswordPolicyContext {
  username?: string;
  email?: string;
  displayName?: string;
}

export interface PasswordPolicyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate a candidate password against the centralized policy.
 *
 * Returns a structured result so callers can emit a single, specific
 * 400 response with the failure reason. Login is intentionally NOT a
 * consumer of this function: enforcing a stricter policy at login
 * would lock out accounts that predate the policy change. The
 * registration, setup, admin create user, and change password
 * handlers are the callers.
 */
export async function validatePasswordPolicy(
  password: unknown,
  context?: PasswordPolicyContext,
): Promise<PasswordPolicyResult> {
  if (typeof password !== 'string') {
    return { valid: false, reason: 'Password is required' };
  }

  const config = getConfig();
  const minLength = config.PASSWORD_MIN_LENGTH;

  if (password.length < minLength) {
    return {
      valid: false,
      reason: `Password must be at least ${minLength} characters`,
    };
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      valid: false,
      reason: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
    };
  }

  const lower = password.toLowerCase();

  if (BANNED_PASSWORDS.has(lower)) {
    return {
      valid: false,
      reason:
        'This password is too common. Please choose a less predictable password.',
    };
  }

  if (context) {
    if (context.username && lower === context.username.toLowerCase()) {
      return {
        valid: false,
        reason: 'Password must not match the username',
      };
    }
    if (context.email && lower === context.email.toLowerCase()) {
      return {
        valid: false,
        reason: 'Password must not match the email address',
      };
    }
    if (context.displayName && lower === context.displayName.toLowerCase()) {
      return {
        valid: false,
        reason: 'Password must not match the display name',
      };
    }
  }

  if (config.PASSWORD_HIBP_CHECK_ENABLED) {
    try {
      const occurrences = await checkHibp(
        password,
        config.PASSWORD_HIBP_TIMEOUT_MS,
      );
      if (occurrences > 0) {
        return {
          valid: false,
          reason:
            'This password appears in known breach corpora. Please choose a password that has not been compromised.',
        };
      }
    } catch (err) {
      // Fail open. An HIBP outage must not prevent a legitimate user
      // from registering, rotating, or changing their password. The
      // failure is logged so operators can notice sustained outages.
      logger.warn('HIBP k-anonymity check failed; allowing password', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { valid: true };
}

/**
 * Query the Have I Been Pwned pwnedpasswords range API using the
 * k-anonymity model. Only the first five hex characters of the
 * SHA-1 hash of the candidate password are sent; the remainder is
 * compared locally. Returns the number of times the password has
 * been observed in breach corpora, or 0 if it has not been seen.
 *
 * The "Add-Padding: true" request header asks HIBP to pad the
 * response so the TLS traffic size does not reveal which prefix
 * bucket was queried. See https://haveibeenpwned.com/API/v3#AddPadding.
 */
export async function checkHibp(
  password: string,
  timeoutMs: number,
): Promise<number> {
  const sha1 = crypto
    .createHash('sha1')
    .update(password)
    .digest('hex')
    .toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        method: 'GET',
        headers: {
          'Add-Padding': 'true',
          'User-Agent': 'cyclonedx-assessors-studio',
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new Error(`HIBP returned HTTP ${response.status}`);
    }
    const body = await response.text();
    for (const line of body.split(/\r?\n/)) {
      if (!line) continue;
      const colonIdx = line.indexOf(':');
      if (colonIdx <= 0) continue;
      const lineSuffix = line.slice(0, colonIdx).trim().toUpperCase();
      if (lineSuffix === suffix) {
        const count = parseInt(line.slice(colonIdx + 1).trim(), 10);
        return Number.isFinite(count) && count > 0 ? count : 1;
      }
    }
    return 0;
  } finally {
    clearTimeout(timer);
  }
}
