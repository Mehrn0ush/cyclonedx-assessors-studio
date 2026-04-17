import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { resetConfig } from '../../config/index.js';
import {
  validatePasswordPolicy,
  checkHibp,
  PASSWORD_MAX_LENGTH,
} from '../../utils/password-policy.js';

/**
 * Snapshot / restore the environment variables that influence the
 * password policy. Each test tweaks these in place and the helper
 * restores them afterwards so cross test pollution cannot hide a
 * regression in defaults.
 */
const POLICY_ENV_KEYS = [
  'PASSWORD_MIN_LENGTH',
  'PASSWORD_HIBP_CHECK_ENABLED',
  'PASSWORD_HIBP_TIMEOUT_MS',
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of POLICY_ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of POLICY_ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetConfig();
}

describe('validatePasswordPolicy', () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    // Ensure every test runs with the documented defaults unless it
    // explicitly overrides them.
    delete process.env.PASSWORD_MIN_LENGTH;
    process.env.PASSWORD_HIBP_CHECK_ENABLED = 'false';
    delete process.env.PASSWORD_HIBP_TIMEOUT_MS;
    resetConfig();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    vi.restoreAllMocks();
  });

  it('rejects non-string inputs', async () => {
    const result = await validatePasswordPolicy(undefined as unknown as string);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/required/i);
  });

  it('rejects passwords shorter than the configured minimum', async () => {
    const result = await validatePasswordPolicy('Short12345!');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/at least 12/);
  });

  it('rejects passwords longer than the hard upper bound', async () => {
    const tooLong = 'A'.repeat(PASSWORD_MAX_LENGTH + 1);
    const result = await validatePasswordPolicy(tooLong);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/at most/);
  });

  it('rejects passwords in the built-in deny list (case-insensitive)', async () => {
    const result = await validatePasswordPolicy('PASSWORD1234');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/too common/i);
  });

  it('rejects passwords equal to the username', async () => {
    const result = await validatePasswordPolicy('myUsername123', {
      username: 'myUsername123',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/username/i);
  });

  it('rejects passwords equal to the email', async () => {
    const result = await validatePasswordPolicy('user@example.com', {
      email: 'user@example.com',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/email/i);
  });

  it('rejects passwords equal to the display name', async () => {
    const result = await validatePasswordPolicy('Hope Is Nice', {
      displayName: 'Hope Is Nice',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/display name/i);
  });

  it('accepts a strong password when HIBP is disabled', async () => {
    const result = await validatePasswordPolicy(
      'correct horse battery staple 42',
    );
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('honors a custom minimum length from env', async () => {
    process.env.PASSWORD_MIN_LENGTH = '16';
    resetConfig();

    const under = await validatePasswordPolicy('Password1234ABCD');
    expect(under.valid).toBe(true); // 16 chars, above banned list, meets new min

    const below = await validatePasswordPolicy('ShortButOk12345');
    expect(below.valid).toBe(false);
    expect(below.reason).toMatch(/at least 16/);
  });

  describe('with HIBP check enabled', () => {
    beforeEach(() => {
      process.env.PASSWORD_HIBP_CHECK_ENABLED = 'true';
      resetConfig();
    });

    it('rejects a password found in breach corpora', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input: unknown) => {
          // Return a body that contains the suffix for the test
          // password, so the policy should reject it. Any other
          // prefix returns an empty body.
          const url = String(input);
          const candidate = 'totallyFineLookingP4ssphrase';
          const sha1 = crypto
            .createHash('sha1')
            .update(candidate)
            .digest('hex')
            .toUpperCase();
          const expected = `https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`;
          const body =
            url === expected ? `${sha1.slice(5)}:1234\r\nDEADBEEF:1\r\n` : '';
          return new Response(body, { status: 200 });
        });

      const result = await validatePasswordPolicy(
        'totallyFineLookingP4ssphrase',
      );
      expect(fetchSpy).toHaveBeenCalled();
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/breach/i);
    });

    it('accepts a password not found in breach corpora', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\r\n', {
          status: 200,
        }),
      );

      const result = await validatePasswordPolicy(
        'anotherStrongUniquePhrase',
      );
      expect(result.valid).toBe(true);
    });

    it('fails open on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('connection refused'),
      );

      const result = await validatePasswordPolicy(
        'networkUnreachableButStrong',
      );
      expect(result.valid).toBe(true);
    });

    it('fails open on non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('', { status: 503 }),
      );

      const result = await validatePasswordPolicy(
        'degradedHibpButStillStrong',
      );
      expect(result.valid).toBe(true);
    });
  });
});

describe('checkHibp k-anonymity contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends only the first 5 hex chars of the SHA-1 hash', async () => {
    const password = 'someRandomPhraseToCheck';
    const sha1 = crypto
      .createHash('sha1')
      .update(password)
      .digest('hex')
      .toUpperCase();
    const expectedPrefix = sha1.slice(0, 5);

    let observedUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: unknown) => {
        observedUrl = String(input);
        return new Response('', { status: 200 });
      },
    );

    await checkHibp(password, 3000);

    expect(observedUrl).toContain(
      `api.pwnedpasswords.com/range/${expectedPrefix}`,
    );
    // The full hash must never leave the client.
    expect(observedUrl).not.toContain(sha1.slice(5));
  });

  it('sets the Add-Padding request header', async () => {
    let observedHeaders: Record<string, string> | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input: unknown, init?: RequestInit) => {
        observedHeaders = init?.headers as Record<string, string> | undefined;
        return new Response('', { status: 200 });
      },
    );

    await checkHibp('anotherCandidatePhrase', 3000);

    expect(observedHeaders).toBeDefined();
    expect(observedHeaders?.['Add-Padding']).toBe('true');
  });
});
